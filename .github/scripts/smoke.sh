#!/usr/bin/env bash
# Prove a deployment from the outside — through CloudFront, as a browser would.
#
#   smoke.sh api <base-url>     /api/v1/readyz: the API is up, reaches Aurora,
#                               and verifies Cognito tokens
#   smoke.sh web <base-url>     the sign-in page renders, the session gate
#                               answers, and Server Actions accept this origin
#
# Retries for up to ~3 minutes: a paused Aurora takes ~15 s to resume, and a
# fresh target needs two passing health checks before the ALB sends it traffic.
set -euo pipefail

kind=${1:?api|web}
base=${2:?base url}
base=${base%/}
attempts=${SMOKE_ATTEMPTS:-18}
pause=${SMOKE_PAUSE:-10}

# Bodies are truncated: a 404 page is 30 kB of HTML and says nothing useful.
fail() { echo "::error::smoke($kind): ${*:0:400}"; return 1; }

check_api() {
  local body status
  body=$(curl -sS --max-time 15 -w '\n%{http_code}' "$base/api/v1/readyz") || return 1
  status=${body##*$'\n'}; body=${body%$'\n'*}
  [ "$status" = "200" ] || fail "readyz answered $status: $body" || return 1
  jq -e '.checks.database == true and .checks.identity == true' >/dev/null <<<"$body" \
    || fail "readyz is degraded: $body"
}

check_web() {
  local page status headers location

  page=$(curl -sS --max-time 15 -w '\n%{http_code}' "$base/de/auth/login") || return 1
  status=${page##*$'\n'}
  [ "$status" = "200" ] || fail "/de/auth/login answered $status" || return 1
  grep -q "ZEITZEUGE" <<<"$page" || fail "/de/auth/login did not render the app" || return 1

  # Signed out, a protected page is sent to sign-in.
  headers=$(curl -sS --max-time 15 -o /dev/null -D - "$base/de/dashboard") || return 1
  status=$(awk 'NR==1 {print $2}' <<<"$headers")
  location=$(tr -d '\r' <<<"$headers" | awk 'tolower($1)=="location:" {print $2}')
  [ "$status" = "307" ] || fail "/de/dashboard answered $status, expected 307" || return 1
  [[ "$location" == *"/de/auth/login?next=%2Fdashboard" ]] \
    || fail "/de/dashboard redirected to '$location'" || return 1

  # Sign-in and sign-up are Server Actions, and Next.js refuses any whose
  # Origin does not match the Host it was given. Behind CloudFront that holds
  # only if the viewer's Host is forwarded. An unknown action id that passes
  # the check is answered `x-nextjs-action-not-found: 1`; one that fails it is
  # a 500 — so this is the sign-in path, tested without an account.
  headers=$(curl -sS --max-time 15 -o /dev/null -D - -X POST "$base/de/auth/login" \
    -H "Origin: $base" -H "Next-Action: smoke-$(date +%s)" \
    -H "Content-Type: text/plain;charset=UTF-8" --data '[]') || return 1
  grep -qi '^x-nextjs-action-not-found: 1' <<<"$headers" \
    || fail "Server Actions refuse origin $base: $(head -1 <<<"$headers")"
}

for attempt in $(seq 1 "$attempts"); do
  if "check_$kind"; then
    echo "smoke($kind): $base is healthy"
    exit 0
  fi
  echo "attempt $attempt/$attempts failed; retrying in ${pause}s"
  sleep "$pause"
done
fail "gave up after $attempts attempts"
