# Module: security
#
# KMS keys, Secrets Manager containers, and every runtime IAM role. The single
# place identity is defined: other modules receive ARNs, never create roles.
#
# Invariants this file enforces, not just documents:
#   - every role is named ${project}-${env}-*, which ZeitzeugeBuilder's
#     PassRole and role-write permissions are scoped to
#   - every role carries permissions_boundary = var.permissions_boundary_arn
#     (ZeitzeugeBoundary). The builder cannot create a role without it, so a
#     missing line fails at apply, not in review
#   - every permission policy is rendered from ../../policies/*.json, the files
#     Access Analyzer validates and a reviewer reads
#   - every service trust policy that supports it carries aws:SourceAccount /
#     aws:SourceArn, so no other account's resource can use these roles
#     (confused-deputy protection)

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  name       = "${var.project}-${var.env}"
  region     = data.aws_region.current.region
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition

  policies_dir = coalesce(var.policies_dir, "${path.module}/../../policies")

  policy_vars = {
    project    = var.project
    env        = var.env
    region     = local.region
    account_id = local.account_id

    # Only ecs-task-api.json uses it; Cognito does not support tag conditions
    # on every action, so the API is scoped to the one pool by ARN.
    cognito_user_pool_arn = coalesce(var.cognito_user_pool_arn, "arn:${local.partition}:cognito-idp:${local.region}:${local.account_id}:userpool/none")
  }
}

# ---------------------------------------------------------------------------
# KMS — one customer-managed key per data domain
# ---------------------------------------------------------------------------
#
# Per-tenant CMKs (PROPOSED_SOLUTION 10.5) are the production path; at
# hackathon scale there is one tenant, so the honest implementation is one key
# per data domain. Runtime roles reach these keys through a tag condition
# (Project + Env), not a key list, so a new key needs no policy change and no
# role can use another project's keys.

locals {
  kms_domains = {
    assets   = "S3: originals, derivatives, exports, DEM cache"
    database = "Aurora cluster storage and snapshots"
    search   = "OpenSearch Serverless collection"
    logs     = "CloudWatch Logs groups, the alerts SNS topic"
    secrets  = "Secrets Manager secrets"
  }
}

data "aws_iam_policy_document" "kms_base" {
  # Standard account-root statement: key access is then governed by IAM
  # policies (and the tag conditions in them), not by per-key grants.
  statement {
    sid       = "AccountIamGovernsAccess"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:${local.partition}:iam::${local.account_id}:root"]
    }
  }
}

data "aws_iam_policy_document" "kms_logs" {
  source_policy_documents = [data.aws_iam_policy_document.kms_base.json]

  # CloudWatch Logs encrypts with the key itself, scoped to this account's log
  # groups through the encryption context.
  statement {
    sid = "CloudWatchLogsForOwnLogGroups"
    actions = [
      "kms:Encrypt*",
      "kms:Decrypt*",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:Describe*",
    ]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["logs.${local.region}.amazonaws.com"]
    }

    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:${local.partition}:logs:${local.region}:${local.account_id}:log-group:*"]
    }
  }

  # The alerts topic is encrypted with this key; the services that publish to
  # it must be able to use it, and only on behalf of this account.
  statement {
    sid       = "AlarmPublishersForOwnTopic"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey*"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com", "events.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_kms_key" "this" {
  for_each = local.kms_domains

  description             = "${local.name} ${each.key}: ${each.value}"
  enable_key_rotation     = true
  rotation_period_in_days = 365
  deletion_window_in_days = var.kms_deletion_window_days
  policy                  = each.key == "logs" ? data.aws_iam_policy_document.kms_logs.json : data.aws_iam_policy_document.kms_base.json

  tags = merge(var.tags, { Name = "${local.name}-${each.key}", DataDomain = each.key })
}

resource "aws_kms_alias" "this" {
  for_each = local.kms_domains

  name          = "alias/${local.name}-${each.key}"
  target_key_id = aws_kms_key.this[each.key].key_id
}

# ---------------------------------------------------------------------------
# Secrets — containers only. Values never pass through Terraform state.
# ---------------------------------------------------------------------------
#
# The Aurora *master* credential is not here: the database module sets
# manage_master_user_password, so RDS owns and rotates it. The application
# connects as a non-owner role (so Postgres RLS applies to it) whose
# credential lives in db/app. Its value is written by the database module
# (which knows the host); the migrate task creates the role from it.

locals {
  secrets = {
    "db/app"            = "Application database role zeitzeuge_app (non-owner, RLS-bound). Value written by the database module; the migrate task creates the role from it."
    "external/api-keys" = "Keys for external knowledge sources, as a JSON object. Set by hand: aws secretsmanager put-secret-value."
  }
}

resource "aws_secretsmanager_secret" "this" {
  for_each = local.secrets

  name                    = "${var.project}/${var.env}/${each.key}"
  description             = each.value
  kms_key_id              = aws_kms_key.this["secrets"].arn
  recovery_window_in_days = var.secret_recovery_window_days

  tags = merge(var.tags, { Name = "${var.project}/${var.env}/${each.key}" })
}

# ---------------------------------------------------------------------------
# Runtime roles
# ---------------------------------------------------------------------------

locals {
  source_account = {
    test     = "StringEquals"
    variable = "aws:SourceAccount"
    values   = [local.account_id]
  }

  roles = {
    ecs-task-execution = {
      description = "ECS agent: pull images, write task logs, inject secrets at start."
      service     = "ecs-tasks.amazonaws.com"
      source_arn  = "arn:${local.partition}:ecs:${local.region}:${local.account_id}:*"
      policy      = "ecs-task-execution"
    }
    ecs-task-api = {
      description = "FastAPI tasks: presign assets, drive investigations, session state."
      service     = "ecs-tasks.amazonaws.com"
      source_arn  = "arn:${local.partition}:ecs:${local.region}:${local.account_id}:*"
      policy      = "ecs-task-api"
    }
    ecs-task-agents = {
      description = "Deep agents on Fargate: same data reach as the Lambda agents."
      service     = "ecs-tasks.amazonaws.com"
      source_arn  = "arn:${local.partition}:ecs:${local.region}:${local.account_id}:*"
      policy      = "lambda-agent"
    }
    lambda-agent-exec = {
      description = "Fast perception agents on Lambda."
      service     = "lambda.amazonaws.com"
      source_arn  = null # Lambda's execution-role trust does not carry the function ARN
      policy      = "lambda-agent"
    }
    sfn-orchestrator = {
      description = "The Step Functions spine: invoke agents, run tasks, call the falsifier."
      service     = "states.amazonaws.com"
      source_arn  = "arn:${local.partition}:states:${local.region}:${local.account_id}:stateMachine:${local.name}-*"
      policy      = "sfn-orchestrator"
    }
    ecs-task-migrate = {
      description = "One-off migrate/seed task: owner credential, run by CI before a rollout."
      service     = "ecs-tasks.amazonaws.com"
      source_arn  = "arn:${local.partition}:ecs:${local.region}:${local.account_id}:*"
      policy      = "ecs-task-migrate"
    }
    cognito-pre-token = {
      description = "Cognito pre-token hook: copies tenant_id and role into the access token."
      service     = "lambda.amazonaws.com"
      source_arn  = null
      policy      = "cognito-pre-token"
    }
    bedrock-logging = {
      description = "Bedrock model-invocation logging delivery to CloudWatch Logs."
      service     = "bedrock.amazonaws.com"
      source_arn  = "arn:${local.partition}:bedrock:${local.region}:${local.account_id}:*"
      policy      = "bedrock-logging"
    }
    sagemaker-exec = {
      description = "SageMaker Serverless endpoints: SAM2 skyline, DEM raycaster."
      service     = "sagemaker.amazonaws.com"
      source_arn  = null # SageMaker supports aws:SourceAccount; the ARN varies by job type
      policy      = "sagemaker-exec"
    }
  }
}

data "aws_iam_policy_document" "trust" {
  for_each = local.roles

  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = [each.value.service]
    }

    dynamic "condition" {
      for_each = each.value.service == "lambda.amazonaws.com" ? [] : [local.source_account]
      content {
        test     = condition.value.test
        variable = condition.value.variable
        values   = condition.value.values
      }
    }

    dynamic "condition" {
      for_each = each.value.source_arn == null ? [] : [each.value.source_arn]
      content {
        test     = "ArnLike"
        variable = "aws:SourceArn"
        values   = [condition.value]
      }
    }
  }
}

resource "aws_iam_role" "this" {
  for_each = local.roles

  name                 = "${local.name}-${each.key}"
  description          = each.value.description
  assume_role_policy   = data.aws_iam_policy_document.trust[each.key].json
  permissions_boundary = var.permissions_boundary_arn
  max_session_duration = 3600

  tags = merge(var.tags, { Name = "${local.name}-${each.key}" })
}

locals {
  # Only the policies a role here actually uses are rendered; builder and
  # boundary policies are root-managed and never pass through Terraform.
  policy = { for p in toset([for r in local.roles : r.policy]) : p => templatefile("${local.policies_dir}/${p}.json", local.policy_vars) }
}

resource "aws_iam_role_policy" "this" {
  for_each = local.roles

  name   = each.value.policy
  role   = aws_iam_role.this[each.key].id
  policy = local.policy[each.value.policy]
}
