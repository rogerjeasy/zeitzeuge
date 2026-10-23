# `bootstrap`

Run once, by a human, before any environment stack. Creates the remote state
bucket (S3 native locking, no DynamoDB table) and references the account's
GitHub OIDC provider.

Its own state lives in that bucket too, under `bootstrap/terraform.tfstate`.
Getting there is a two-step chicken-and-egg:

```bash
cp terraform.tfvars.example terraform.tfvars   # account id in the bucket name
# 1. comment out the backend "s3" block in versions.tf (the bucket doesn't exist yet)
terraform init && terraform apply
# 2. uncomment it and move the local state into the bucket
terraform init -migrate-state
terraform plan                                 # must show no changes
```

In this account both steps are done; a plain `terraform init` reads the state
from S3.
