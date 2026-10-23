#!/usr/bin/env bash
# Create the remote state backend and the GitHub OIDC provider. Run once.
set -euo pipefail
cd "$(dirname "$0")/../bootstrap"

if [ ! -f terraform.tfvars ]; then
  echo "Copy terraform.tfvars.example to terraform.tfvars and set a unique bucket name first." >&2
  exit 1
fi

terraform init
terraform apply
echo
echo "Copy these into infra/envs/*/backend.tf and envs/*/terraform.tfvars:"
terraform output
