# Module: orchestration
#
# The spine (PROPOSED_SOLUTION §10.2). Step Functions owns the control flow,
# so no tool output — a verso transcription, an API response — can change
# which step runs next. That is the prompt-injection answer, structurally.
#
#   investigation  Standard. Intake → Parallel(perception) → Grounding →
#                  Hypothesise → Map(falsify) → RedTeam → Adjudicate →
#                  Produce → WaitForTaskToken(archivist) → Learn.
#                  Standard, not Express: the archivist's sign-off is a
#                  durable state that may wait days (max one year).
#   bulk           Distributed Map over the S3 inventory of the archive:
#                  the backlog, bounded concurrency, 5 % tolerated failures.
#
# ASL lives in orchestration/statemachines/*.asl.json and is rendered here with
# templatefile(): JSON embedded in HCL is neither readable nor lintable.
#
# Every execution is logged at ALL with execution data and traced in X-Ray —
# the run's audit trail, replayable, for free.

locals {
  name    = "${var.project}-${var.env}"
  asl_dir = coalesce(var.asl_dir, "${path.module}/../../../orchestration/statemachines")

  investigation_vars = merge(
    { for k, arn in var.agent_function_arns : "agent_${replace(k, "-", "_")}_arn" => arn },
    { falsifier_endpoint = var.falsifier_endpoint_name },
  )
}

resource "aws_cloudwatch_log_group" "this" {
  for_each = toset(["investigation", "bulk"])

  # The /aws/vendedlogs/ prefix keeps Step Functions under the CloudWatch
  # Logs resource-policy size limit.
  name              = "/aws/vendedlogs/states/${local.name}-${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.logs_kms_key_arn
  tags              = var.tags
}

resource "aws_sfn_state_machine" "investigation" {
  name     = "${local.name}-investigation"
  type     = "STANDARD"
  role_arn = var.role_arn

  definition = templatefile("${local.asl_dir}/investigation.asl.json", local.investigation_vars)

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.this["investigation"].arn}:*"
    include_execution_data = true
    level                  = "ALL"
  }

  tracing_configuration {
    enabled = true
  }

  encryption_configuration {
    type                              = "CUSTOMER_MANAGED_KMS_KEY"
    kms_key_id                        = var.kms_key_arn
    kms_data_key_reuse_period_seconds = 300
  }

  tags = var.tags
}

resource "aws_sfn_state_machine" "bulk" {
  name     = "${local.name}-bulk"
  type     = "STANDARD"
  role_arn = var.role_arn

  definition = templatefile("${local.asl_dir}/bulk.asl.json", {
    inventory_bucket                = var.inventory_bucket
    investigation_state_machine_arn = aws_sfn_state_machine.investigation.arn
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.this["bulk"].arn}:*"
    include_execution_data = false # thousands of items; the child executions carry the detail
    level                  = "ERROR"
  }

  tracing_configuration {
    enabled = true
  }

  encryption_configuration {
    type                              = "CUSTOMER_MANAGED_KMS_KEY"
    kms_key_id                        = var.kms_key_arn
    kms_data_key_reuse_period_seconds = 300
  }

  tags = var.tags
}

# Items that exhaust their retries in the bulk run land here for a human.
resource "aws_sqs_queue" "bulk_dlq" {
  name                      = "${local.name}-bulk-dlq"
  message_retention_seconds = 1209600 # 14 days, the SQS maximum
  sqs_managed_sse_enabled   = true
  tags                      = var.tags
}
