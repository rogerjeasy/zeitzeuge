# Module: keyvalue
#
# DynamoDB tables, all on-demand (no idle cost), all encrypted with the
# `database` CMK, all with TTL where rows are transient.
#
#   agent-memory  curator corrections, learned aliases, few-shot exemplars.
#                 The only table whose loss is a real loss: PITR + deletion
#                 protection.
#   idempotency   one row per request hash, so a retried Step Functions task
#                 or double-clicked upload does its work once
#   tool-cache    swisstopo / Wikidata / GeoAdmin responses. Why the demo is
#                 fast and deterministic on venue wifi — warm it at setup
#   run-locks     one live run per image; also the fan-out registry for
#                 WebSocket run streams across API tasks
#   rate-limit    auth throttling (apps/api: pk + expires_at TTL)

locals {
  name = "${var.project}-${var.env}"

  tables = {
    agent-memory = { hash = "tenant_id", range = "exemplar_id", ttl = null, precious = true }
    idempotency  = { hash = "request_hash", range = null, ttl = "expires_at", precious = false }
    tool-cache   = { hash = "pk", range = null, ttl = "expires_at", precious = false }
    run-locks    = { hash = "run_id", range = null, ttl = "expires_at", precious = false }
    rate-limit   = { hash = "pk", range = null, ttl = "expires_at", precious = false }
  }
}

resource "aws_dynamodb_table" "this" {
  for_each = local.tables

  name         = "${local.name}-${each.key}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = each.value.hash
  range_key    = each.value.range

  attribute {
    name = each.value.hash
    type = "S"
  }

  dynamic "attribute" {
    for_each = each.value.range == null ? [] : [each.value.range]
    content {
      name = attribute.value
      type = "S"
    }
  }

  dynamic "ttl" {
    for_each = each.value.ttl == null ? [] : [each.value.ttl]
    content {
      attribute_name = ttl.value
      enabled        = true
    }
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  point_in_time_recovery {
    enabled = each.value.precious
  }

  deletion_protection_enabled = each.value.precious && var.deletion_protection

  tags = merge(var.tags, { Name = "${local.name}-${each.key}" })
}
