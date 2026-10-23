terraform {
  backend "s3" {
    # Values come from `terraform output` in infra/bootstrap.
    bucket       = "zeitzeuge-tfstate-707938860881-euc2"
    key          = "envs/prod/terraform.tfstate"
    region       = "eu-central-2"
    use_lockfile = true
    encrypt      = true
  }
}
