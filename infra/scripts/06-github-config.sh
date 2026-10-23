#!/usr/bin/env bash
# Hand the applied infrastructure to GitHub Actions — the step between
# `make apply` and the first real deploy.
#
#   make github                    # repo from terraform.tfvars (github_repo)
#   REPO=owner/name make github    # or explicitly
#
# Writes, from `terraform output` (nothing is typed by hand, so nothing drifts):
#
#   secret    AWS_DEPLOY_ROLE_ARN          the OIDC deploy role (no access keys exist)
#   variable  ECS_MIGRATE_NETWORK_CONFIG   subnets + SG for the migrate and seed tasks
#   variable  APP_URL                      what the smoke tests call, through CloudFront
#   variable  DEPLOY_ENABLED=true          switches the deploy jobs on
#
# Idempotent. Needs `gh auth login` and a builder session (`aws login`).
# To pause deploys again: gh variable set DEPLOY_ENABLED --body false
set -euo pipefail

ENV="${ENV:-prod}"
cd "$(dirname "$0")/../envs/$ENV"

command -v gh >/dev/null || { echo "gh (GitHub CLI) is required: brew install gh" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not signed in: gh auth login" >&2; exit 1; }

REPO="${REPO:-$(sed -nE 's/^github_repo[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' terraform.tfvars)}"
[ -n "$REPO" ] || { echo "no github_repo in terraform.tfvars; set REPO=owner/name" >&2; exit 1; }

output() {
  local value
  value=$(terraform output -raw "$1" 2>/dev/null) || true
  if [ -z "$value" ]; then
    echo "terraform output '$1' is empty — has 'make apply' completed for $ENV?" >&2
    exit 1
  fi
  printf '%s' "$value"
}

ROLE_ARN=$(output deploy_role_arn)
NETWORK=$(output migrate_network_configuration)
APP_URL=$(output app_url)

# The secret goes in through stdin, never through argv (visible in `ps`).
printf '%s' "$ROLE_ARN" | gh secret set AWS_DEPLOY_ROLE_ARN --repo "$REPO"
gh variable set ECS_MIGRATE_NETWORK_CONFIG --repo "$REPO" --body "$NETWORK"
gh variable set APP_URL --repo "$REPO" --body "${APP_URL%/}"
gh variable set DEPLOY_ENABLED --repo "$REPO" --body true

echo "GitHub $REPO is wired to $ENV:"
echo "  AWS_DEPLOY_ROLE_ARN  ${ROLE_ARN}"
echo "  APP_URL              ${APP_URL%/}"
echo "Deploy now with:  gh workflow run deploy-api.yml --repo $REPO && gh workflow run deploy-web.yml --repo $REPO"
