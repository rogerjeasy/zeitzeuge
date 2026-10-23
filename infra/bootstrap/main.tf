# Bootstrap — run once, by a human, with local credentials.
#
# Creates the three things that cannot be created by the stacks that need them:
#   1. the S3 bucket holding remote state
#   2. nothing for locking: backends use S3 native lock files (use_lockfile),
#      so there is no DynamoDB lock table to create, pay for or permission
#   3. the GitHub OIDC identity provider (referenced if the account already has it), so CI
#      never needs an access key
#
#   cd infra/bootstrap
#   terraform init && terraform apply
#
# Then copy the outputs into infra/envs/*/backend.tf and the repository secrets.

# ---------------------------------------------------------------------------
# Remote state
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket_name

  # State for a 24-hour project. Keep the bucket when the stack is destroyed so
  # a fat-fingered `terraform destroy` in bootstrap cannot orphan every other
  # stack's state.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# State holds resource ids and, for some resources, secrets in plain text.
# TLS only, and nothing unencrypted lands in it.
data "aws_iam_policy_document" "state" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.state.arn,
      "${aws_s3_bucket.state.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.state.json

  depends_on = [aws_s3_bucket_public_access_block.state]
}

# Versioning is the undo button for a corrupted state; 90 days of old
# versions is plenty for a project this size and keeps the bucket from growing.
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  depends_on = [aws_s3_bucket_versioning.state]
}

# ---------------------------------------------------------------------------
# Keyless CI — GitHub Actions assumes a role via OIDC. No long-lived AWS keys
# exist anywhere in this project (PROPOSED_SOLUTION 10.5).
# ---------------------------------------------------------------------------

# AWS allows one OIDC provider per issuer URL per account, and this account
# already has GitHub's. It is the single shared, account-level object; every
# ZEITZEUGE resource, including the deploy roles that trust it, is our own.
# The trust policy in modules/cicd pins repo and ref, so sharing the provider
# grants no other repository anything. Set create_github_oidc_provider = true
# in a clean account.

data "tls_certificate" "github" {
  count = var.create_github_oidc_provider ? 1 : 0
  url   = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  count           = var.create_github_oidc_provider ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github[0].certificates[0].sha1_fingerprint]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"

  lifecycle {
    postcondition {
      condition     = contains(self.client_id_list, "sts.amazonaws.com")
      error_message = "The existing GitHub OIDC provider does not list sts.amazonaws.com as an audience; aws-actions/configure-aws-credentials will be rejected."
    }
  }
}

locals {
  github_oidc_provider_arn = (
    var.create_github_oidc_provider
    ? aws_iam_openid_connect_provider.github[0].arn
    : data.aws_iam_openid_connect_provider.github[0].arn
  )
}

# The deploy role itself is defined per environment in modules/cicd, which
# references this provider by ARN. Its trust policy pins the repo *and* the ref:
#   "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:ref:refs/heads/main"
# A wildcard there would let any branch — including a fork's PR branch — deploy.
