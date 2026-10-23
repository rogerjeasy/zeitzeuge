#!/usr/bin/env bash
# After the hackathon: stop the meter. Deliberately two-step, because the
# protections that make this slow are the ones that keep the archive safe.
#
#   1. drop deletion protection (Aurora, ALB, Cognito, agent-memory) — an apply
#   2. empty the buckets you really mean to lose, then destroy
#
# Kept regardless: the Terraform state bucket (bootstrap/) and anything you do
# not empty. Aurora leaves a final snapshot `zeitzeuge-prod-final`.
set -euo pipefail

ENV="${1:-prod}"
cd "$(dirname "$0")/../envs/$ENV"

echo "This destroys the '$ENV' environment."
read -r -p "Type the environment name to confirm: " ans
[ "$ans" = "$ENV" ] || { echo "aborted"; exit 1; }

echo "==> 1/3 Dropping deletion protection"
terraform apply -var deletion_protection=false

echo "==> 2/3 Buckets are never emptied by Terraform (force_destroy = false)."
for b in $(terraform output -json buckets | python3 -c 'import json,sys; print(" ".join(json.load(sys.stdin).values()))') "$(terraform output -raw access_logs_bucket 2>/dev/null || true)"; do
  [ -n "$b" ] || continue
  read -r -p "   Empty s3://$b (all versions)? [y/N] " yn
  [ "$yn" = "y" ] || continue
  python3 -c 'import boto3' 2>/dev/null || { echo "   needs boto3: pip install boto3"; exit 1; }
  python3 - "$b" <<'PY'
import boto3, sys
bucket = boto3.resource("s3").Bucket(sys.argv[1])
bucket.object_versions.delete()
print(f"   emptied {sys.argv[1]}")
PY
done

echo "==> 3/3 Destroying"
terraform destroy
echo
echo "Left on purpose: the state bucket (bootstrap/), the IAM user, group and the two"
echo "root-managed policies. Delete those by hand, as root, when the project is over."
