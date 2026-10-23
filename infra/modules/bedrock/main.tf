# Module: bedrock
#
#   guardrail            content + prompt-attack filters, PII masking, contextual
#                        grounding, and a denied topic for identifying people —
#                        §17's "face detection, never recognition", enforced by
#                        the model layer instead of promised on a slide
#   invocation logging   every prompt and completion, with model id and version,
#                        to CloudWatch (logs CMK); payloads over 100 KB to S3
#   application profiles one per ModelRouter tier, each a copy of an `eu.*`
#                        system profile. Same EU-only routing, but tagged, so
#                        Bedrock spend is attributable to this project in
#                        billing and budgets
#
# Model *access* is not Terraform: it is a per-account entitlement
# (scripts/02-enable-bedrock-models.sh). This account already has it.

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  name       = "${var.project}-${var.env}"
  region     = data.aws_region.current.region
  account_id = data.aws_caller_identity.current.account_id
}

# ---------------------------------------------------------------------------
# Guardrail
# ---------------------------------------------------------------------------

resource "aws_bedrock_guardrail" "this" {
  name                      = local.name
  description               = "ZEITZEUGE agents: no identification of people, no PII leakage, grounded answers only."
  blocked_input_messaging   = "Diese Anfrage kann ZEITZEUGE nicht bearbeiten."
  blocked_outputs_messaging = "Diese Antwort wurde von ZEITZEUGE zurückgehalten."
  kms_key_arn               = var.kms_key_arn

  content_policy_config {
    dynamic "filters_config" {
      for_each = ["HATE", "INSULTS", "SEXUAL", "VIOLENCE", "MISCONDUCT"]
      content {
        type            = filters_config.value
        input_strength  = "MEDIUM"
        output_strength = "MEDIUM"
      }
    }

    # Verso transcriptions and external API responses are untrusted input.
    filters_config {
      type            = "PROMPT_ATTACK"
      input_strength  = "HIGH"
      output_strength = "NONE"
    }
  }

  topic_policy_config {
    topics_config {
      name       = "identifying-people"
      type       = "DENY"
      definition = "Naming, identifying or recognising a specific real person from their face, body or appearance in a photograph."
      examples = [
        "Who is the man standing in front of the church?",
        "Wer ist die Frau auf diesem Foto?",
        "Match this face to a known person.",
      ]
    }
  }

  sensitive_information_policy_config {
    dynamic "pii_entities_config" {
      for_each = ["EMAIL", "PHONE", "CREDIT_DEBIT_CARD_NUMBER", "INTERNATIONAL_BANK_ACCOUNT_NUMBER", "PASSWORD"]
      content {
        type   = pii_entities_config.value
        action = "ANONYMIZE"
      }
    }
  }

  # A claim the evidence does not support is withheld, not softened (P1).
  contextual_grounding_policy_config {
    filters_config {
      type      = "GROUNDING"
      threshold = var.grounding_threshold
    }
    filters_config {
      type      = "RELEVANCE"
      threshold = var.grounding_threshold
    }
  }

  tags = var.tags
}

resource "aws_bedrock_guardrail_version" "this" {
  guardrail_arn = aws_bedrock_guardrail.this.guardrail_arn
  description   = "Published by Terraform; agents pin this version."

  lifecycle {
    replace_triggered_by = [aws_bedrock_guardrail.this]
  }
}

# ---------------------------------------------------------------------------
# Invocation logging (one configuration per account and region — Zurich's
# was unused before this project)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "invocations" {
  name              = "/aws/bedrock/${local.name}/invocations"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.logs_kms_key_arn
  tags              = var.tags
}

resource "aws_bedrock_model_invocation_logging_configuration" "this" {
  logging_config {
    text_data_delivery_enabled      = true
    image_data_delivery_enabled     = false # the scans are already in S3; do not copy them into logs
    embedding_data_delivery_enabled = false

    cloudwatch_config {
      log_group_name = aws_cloudwatch_log_group.invocations.name
      role_arn       = var.logging_role_arn

      large_data_delivery_s3_config {
        bucket_name = var.log_bucket
        key_prefix  = "bedrock/large"
      }
    }
  }
}

# ---------------------------------------------------------------------------
# Application inference profiles — the ModelRouter's three tiers
# ---------------------------------------------------------------------------

resource "aws_bedrock_inference_profile" "this" {
  for_each = var.model_tiers

  name = "${local.name}-${each.key}"
  # Bedrock allows only [0-9a-zA-Z:.] with single " ", "_" or "-" between —
  # no parentheses, no trailing punctuation after a space.
  description = "ZEITZEUGE ${each.key} tier over ${each.value} EU-only routing"

  model_source {
    copy_from = "arn:aws:bedrock:${local.region}:${local.account_id}:inference-profile/${each.value}"
  }

  tags = merge(var.tags, { ModelTier = each.key })
}
