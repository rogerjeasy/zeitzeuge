# Module: compute-agents
#
# Every agent the investigation state machine calls, plus the task definition
# for agents that outlive a Lambda.
#
#   Lambda      one function per agent, arm64, container image from
#               zeitzeuge/agents (one image, one handler per agent). Outside
#               the VPC on purpose: Bedrock, DynamoDB and S3 are public AWS
#               APIs, Aurora is reached through the Data API, so no ENI, no
#               NAT bill, no cold-start penalty.
#   Fargate     `zeitzeuge-prod-agent-deep`: long agent loops, started by
#               Step Functions as ecs:RunTask.sync, never as a service.
#
# The function set is the ASL's: orchestration/statemachines/investigation
# .asl.json names every agent it calls as ${agent_<key>_arn}, and
# local.agents below is that list. Adding an agent means both files.
#
# Functions exist only once the image does (`agents_image_ready`); the state
# machine references them by deterministic ARN, so it applies either way.

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  name       = "${var.project}-${var.env}"
  region     = data.aws_region.current.region
  account_id = data.aws_caller_identity.current.account_id

  # key => { timeout seconds, memory MB }. Reasoning agents get five minutes;
  # perception agents two; plumbing thirty seconds.
  agents = {
    intake         = { timeout = 120, memory = 2048 }
    skyline        = { timeout = 120, memory = 2048 }
    built          = { timeout = 120, memory = 2048 }
    vehicles       = { timeout = 120, memory = 2048 }
    signage        = { timeout = 120, memory = 2048 }
    verso          = { timeout = 120, memory = 2048 }
    material       = { timeout = 120, memory = 2048 }
    sensitivity    = { timeout = 120, memory = 1024 }
    grounding      = { timeout = 300, memory = 2048 }
    hypothesise    = { timeout = 300, memory = 2048 }
    chronology     = { timeout = 300, memory = 2048 }
    cached-horizon = { timeout = 30, memory = 1024 }
    redteam        = { timeout = 300, memory = 2048 }
    adjudicate     = { timeout = 300, memory = 2048 }
    produce        = { timeout = 300, memory = 2048 }
    notify         = { timeout = 30, memory = 512 }
    learn          = { timeout = 60, memory = 1024 }
  }

  function_names = { for k, _ in local.agents : k => "${local.name}-agent-${k}" }

  # Deterministic, so the state machine can be rendered before the functions
  # exist — and so it never silently points at another function.
  function_arns = { for k, n in local.function_names : k => "arn:aws:lambda:${local.region}:${local.account_id}:function:${n}" }

  common_env = merge({
    ZZ_ENV                 = var.env
    ZZ_REGION              = local.region
    ZZ_DB_CLUSTER_ARN      = var.db_cluster_arn
    ZZ_DB_SECRET_ARN       = var.db_app_secret_arn
    ZZ_DB_NAME             = var.db_name
    ZZ_ORIGINALS_BUCKET    = var.bucket_names["originals"]
    ZZ_DERIVATIVES_BUCKET  = var.bucket_names["derivatives"]
    ZZ_DEM_CACHE_BUCKET    = var.bucket_names["dem-cache"]
    ZZ_MEMORY_TABLE        = var.table_names["agent-memory"]
    ZZ_TOOL_CACHE_TABLE    = var.table_names["tool-cache"]
    ZZ_IDEMPOTENCY_TABLE   = var.table_names["idempotency"]
    ZZ_GUARDRAIL_ID        = var.guardrail_id
    ZZ_GUARDRAIL_VERSION   = var.guardrail_version
    ZZ_MODEL_REASONING_ARN = var.inference_profile_arns["reasoning"]
    ZZ_MODEL_BALANCED_ARN  = var.inference_profile_arns["balanced"]
    ZZ_MODEL_FAST_ARN      = var.inference_profile_arns["fast"]
    ZZ_EXTERNAL_KEYS_REF   = "secretsmanager://${var.external_keys_secret_arn}"
  }, var.extra_env)
}

# ---------------------------------------------------------------------------
# Lambda agents
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "agent" {
  for_each = local.function_names

  name              = "/aws/lambda/${each.value}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.logs_kms_key_arn
  tags              = var.tags
}

resource "aws_lambda_function" "agent" {
  for_each = var.agents_image_ready ? local.agents : {}

  function_name = local.function_names[each.key]
  description   = "ZEITZEUGE agent: ${each.key}"
  role          = var.lambda_role_arn
  package_type  = "Image"
  image_uri     = "${var.agents_repository_url}:latest"
  architectures = ["arm64"]
  memory_size   = each.value.memory
  timeout       = each.value.timeout

  image_config {
    command = ["zeitzeuge_agents.handlers.${replace(each.key, "-", "_")}.handler"]
  }

  environment {
    variables = merge(local.common_env, { ZZ_AGENT = each.key })
  }

  tracing_config {
    mode = "Active"
  }

  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.agent[each.key].name
  }

  # The cost guardrail between a runaway Distributed Map and the credit.
  # 17 agents x cap must leave >= 100 unreserved out of the account's 1000.
  reserved_concurrent_executions = var.reserved_concurrency

  tags = merge(var.tags, { Agent = each.key })

  lifecycle {
    # CI (deploy-agents.yml) points functions at the sha-tagged image.
    ignore_changes = [image_uri]
  }
}

# ---------------------------------------------------------------------------
# Deep agents on Fargate
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "deep" {
  name              = "/ecs/${local.name}-agent-deep"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.logs_kms_key_arn
  tags              = var.tags
}

resource "aws_ecs_task_definition" "deep" {
  family                   = "${local.name}-agent-deep"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.deep_cpu
  memory                   = var.deep_memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.ecs_task_role_arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  volume {
    name = "tmp"
  }

  container_definitions = jsonencode([{
    name                   = "agent"
    image                  = "${var.agents_repository_url}:latest"
    essential              = true
    readonlyRootFilesystem = true
    command                = ["python", "-m", "zeitzeuge_agents.deep"]
    environment            = [for k, v in merge(local.common_env, { ZZ_AGENT = "deep" }) : { name = k, value = v }]
    mountPoints            = [{ sourceVolume = "tmp", containerPath = "/tmp" }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.deep.name
        awslogs-region        = local.region
        awslogs-stream-prefix = "deep"
      }
    }
  }])

  tags = var.tags
}

# ---------------------------------------------------------------------------
# Warm-up before the pitch
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "warm" {
  count = var.agents_image_ready ? 1 : 0

  name                = "${local.name}-agents-warm"
  description         = "Keeps the demo-critical agents warm during the event window."
  schedule_expression = "rate(5 minutes)"
  state               = var.warm_enabled ? "ENABLED" : "DISABLED"
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "warm" {
  for_each = var.agents_image_ready ? toset(var.warm_agents) : toset([])

  rule  = aws_cloudwatch_event_rule.warm[0].name
  arn   = aws_lambda_function.agent[each.key].arn
  input = jsonencode({ warmup = true })
}

resource "aws_lambda_permission" "warm" {
  for_each = var.agents_image_ready ? toset(var.warm_agents) : toset([])

  statement_id  = "AllowWarmupRule"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.agent[each.key].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.warm[0].arn
}
