#!/usr/bin/env bash
# Merge the public-tool keys from apps/api/.env into the external/api-keys secret.
#
# The deployed worker reads `openai`, `gemini`, `serpapi` and `google` from the
# JSON secret {project}/{env}/external/api-keys (identification-upgrade note §4).
# This script keeps every field already in the secret and overwrites only the
# ones present in .env. It prints field names, never values.
#
#   AWS_PROFILE=zeitzeuge infra/scripts/08-external-keys.sh
#
# Afterwards restart the API service so the worker reads the new keys:
#   aws ecs update-service --region eu-central-2 --cluster zeitzeuge-prod --service zeitzeuge-prod-api --force-new-deployment
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/apps/api/.env}"
SECRET_ID="${SECRET_ID:-zeitzeuge/prod/external/api-keys}"
PROFILE="${AWS_PROFILE:-zeitzeuge}"

umask 077
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

aws secretsmanager get-secret-value --profile "$PROFILE" --secret-id "$SECRET_ID" \
  --query SecretString --output text >"$tmp"

python3 -I - "$tmp" "$ENV_FILE" <<'PY'
import json, re, sys
from pathlib import Path

secret_path, env_path = Path(sys.argv[1]), Path(sys.argv[2])
data = json.loads(secret_path.read_text() or "{}")
env = {}
for line in env_path.read_text().splitlines():
    match = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", line)
    if match:
        env[match.group(1).upper()] = match.group(2).strip().strip('"').strip("'")
mapping = {
    "openai": "OPENAI_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "serpapi": "SERPAPI_API_KEY",
    "google": "GOOGLE_API_KEY",
}
changed = [field for field, name in mapping.items() if env.get(name)]
for field in changed:
    data[field] = env[mapping[field]]
secret_path.write_text(json.dumps(data))
print("updating:", ", ".join(changed) or "nothing", "| fields after:", ", ".join(sorted(data)))
PY

aws secretsmanager put-secret-value --profile "$PROFILE" --secret-id "$SECRET_ID" \
  --secret-string "file://$tmp" --query VersionId --output text >/dev/null
echo "secret $SECRET_ID updated"
