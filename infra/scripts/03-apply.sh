#!/usr/bin/env bash
# Plan and apply one environment. Always shows the plan before touching anything.
set -euo pipefail

ENV="${1:-prod}"
cd "$(dirname "$0")/../envs/$ENV"

terraform init -upgrade
terraform fmt -check -recursive ../.. || { echo "run: make fmt"; exit 1; }
terraform validate
terraform plan -out=tfplan
echo
read -r -p "Apply this plan to '$ENV'? [y/N] " ans
[ "$ans" = "y" ] && terraform apply tfplan
