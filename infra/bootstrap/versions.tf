terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.66"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Chicken and egg, resolved in two steps: the first apply ran on local state
  # (the bucket did not exist yet), then the state was migrated into the bucket
  # it created with `terraform init -migrate-state`. A fresh account repeats
  # that: comment this block out, apply, uncomment, migrate.
  backend "s3" {
    bucket       = "zeitzeuge-tfstate-707938860881-euc2"
    key          = "bootstrap/terraform.tfstate"
    region       = "eu-central-2"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = var.project
      Component = "bootstrap"
      ManagedBy = "terraform"
    }
  }
}
