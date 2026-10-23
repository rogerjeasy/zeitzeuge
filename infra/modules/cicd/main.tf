# Module: cicd
#
# The keyless deploy path. GitHub Actions presents a short-lived OIDC token;
# this role accepts it only from one repository, one branch, one audience.
#
#   trust        repo:rogerjeasy@58919295/zeitzeuge@1431496127:ref:refs/heads/main
#                (GitHub's immutable subject), aud sts
#   permissions  policies/github-deploy.json: push images, run the migrate
#                task, roll services, update agent code, invalidate the edge.
#                No IAM, no deletes, no Terraform — infrastructure changes are
#                applied by the builder, with MFA, after a reviewed plan.
#   boundary     ZeitzeugeBoundary, like every role
#
# The OIDC provider is the account's existing one (one per issuer URL per
# account); the trust policy below is what makes sharing it safe.

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  name = "${var.project}-${var.env}"
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [var.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Exact match, never a wildcard: `repo:owner/name:*` would let any branch —
    # or a fork's pull request — deploy to production. The immutable subject
    # (owner and repository *ids*) also survives a rename and cannot be claimed
    # by whoever creates a repository of the same name later.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${coalesce(var.github_subject_prefix, "repo:${var.github_repo}")}:ref:${var.allowed_ref}"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "${local.name}-github-deploy"
  description          = "GitHub Actions deploys from ${var.github_repo}@${var.allowed_ref}. No IAM, no deletes."
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  permissions_boundary = var.permissions_boundary_arn
  max_session_duration = 3600
  tags                 = var.tags
}

resource "aws_iam_role_policy" "deploy" {
  name = "github-deploy"
  role = aws_iam_role.deploy.id
  policy = templatefile("${coalesce(var.policies_dir, "${path.module}/../../policies")}/github-deploy.json", {
    project    = var.project
    env        = var.env
    region     = data.aws_region.current.region
    account_id = data.aws_caller_identity.current.account_id
  })
}
