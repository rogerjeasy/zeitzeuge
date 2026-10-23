# Module: observability
#
#   alerts topic    SNS, logs CMK, email subscription — every alarm and every
#                   failed investigation lands here
#   alarms          the request path end to end: edge → ALB → services →
#                   Step Functions → agents → Bedrock → Aurora → falsifier
#   dashboard       `zeitzeuge-prod-live` — the one on stage next to the
#                   Agent Theater
#   X-Ray           sampling rule: every investigation traced, run_id as root
#
# The §10.6 product metrics (evidence_items_per_run, abstention_rate,
# falsifier_refutations, human_override_rate, cost_per_image, p95_latency) are
# emitted by the API and agents in CloudWatch Embedded Metric Format under the
# `ZEITZEUGE` namespace — structured log lines CloudWatch turns into metrics
# with no metric filter to keep in sync. The dashboard reads them from there.

data "aws_region" "current" {}

locals {
  name   = "${var.project}-${var.env}"
  region = data.aws_region.current.region
  ns     = "ZEITZEUGE"
}

# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  name              = "${local.name}-alerts"
  kms_master_key_id = var.kms_key_arn
  tags              = var.tags
}

data "aws_iam_policy_document" "alerts" {
  statement {
    sid       = "EventBridgePublish"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.sfn_failed.arn]
    }
  }

  statement {
    sid       = "CloudWatchAlarmsPublish"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts.json
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# Every failed, timed-out or aborted investigation, with its execution ARN.
resource "aws_cloudwatch_event_rule" "sfn_failed" {
  name        = "${local.name}-investigation-failed"
  description = "An investigation or bulk run ended in failure."
  event_pattern = jsonencode({
    source      = ["aws.states"]
    detail-type = ["Step Functions Execution Status Change"]
    detail = {
      status          = ["FAILED", "TIMED_OUT", "ABORTED"]
      stateMachineArn = var.state_machine_arns
    }
  })
  tags = var.tags
}

resource "aws_cloudwatch_event_target" "sfn_failed" {
  rule = aws_cloudwatch_event_rule.sfn_failed.name
  arn  = aws_sns_topic.alerts.arn

  input_transformer {
    input_paths = {
      status    = "$.detail.status"
      execution = "$.detail.executionArn"
      machine   = "$.detail.stateMachineArn"
    }
    input_template = "\"ZEITZEUGE: <machine> ended <status>. Execution: <execution>\""
  }
}

# ---------------------------------------------------------------------------
# Alarms
# ---------------------------------------------------------------------------

locals {
  alarms = merge(
    {
      for svc, tg in var.target_group_arn_suffixes : "${svc}-unhealthy" => {
        description = "The ${svc} target group has an unhealthy target."
        namespace   = "AWS/ApplicationELB"
        metric      = "UnHealthyHostCount"
        stat        = "Maximum"
        threshold   = 0
        dimensions  = { LoadBalancer = var.alb_arn_suffix, TargetGroup = tg }
        periods     = 2
      }
    },
    {
      alb-5xx = {
        description = "The ALB is returning 5xx from targets."
        namespace   = "AWS/ApplicationELB"
        metric      = "HTTPCode_Target_5XX_Count"
        stat        = "Sum"
        threshold   = 10
        dimensions  = { LoadBalancer = var.alb_arn_suffix }
        periods     = 1
      }
      investigations-failed = {
        description = "Investigations are failing."
        namespace   = "AWS/States"
        metric      = "ExecutionsFailed"
        stat        = "Sum"
        threshold   = 0
        dimensions  = { StateMachineArn = var.state_machine_arns[0] }
        periods     = 1
      }
      lambda-throttles = {
        description = "Agents are being throttled — the Lambda concurrency limit is binding."
        namespace   = "AWS/Lambda"
        metric      = "Throttles"
        stat        = "Sum"
        threshold   = 0
        dimensions  = {}
        periods     = 1
      }
      lambda-errors = {
        description = "Agents are erroring."
        namespace   = "AWS/Lambda"
        metric      = "Errors"
        stat        = "Sum"
        threshold   = 5
        dimensions  = {}
        periods     = 1
      }
      bedrock-throttles = {
        description = "Bedrock is throttling model calls."
        namespace   = "AWS/Bedrock"
        metric      = "InvocationThrottles"
        stat        = "Sum"
        threshold   = 0
        dimensions  = {}
        periods     = 1
      }
      aurora-at-ceiling = {
        description = "Aurora is at its ACU ceiling; raise max_capacity or find the query."
        namespace   = "AWS/RDS"
        metric      = "ServerlessDatabaseCapacity"
        stat        = "Maximum"
        threshold   = var.db_max_capacity - 0.5
        dimensions  = { DBClusterIdentifier = var.db_cluster_id }
        periods     = 3
      }
    },
    var.falsifier_endpoint_enabled ? {
      falsifier-errors = {
        description = "The Terrain Falsifier endpoint is failing; the cached-horizon fallback is answering."
        namespace   = "AWS/SageMaker"
        metric      = "Invocation5XXErrors"
        stat        = "Sum"
        threshold   = 0
        dimensions  = { EndpointName = var.falsifier_endpoint_name, VariantName = "primary" }
        periods     = 1
      }
    } : {},
  )
}

resource "aws_cloudwatch_metric_alarm" "this" {
  for_each = local.alarms

  alarm_name          = "${local.name}-${each.key}"
  alarm_description   = each.value.description
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  statistic           = each.value.stat
  dimensions          = each.value.dimensions
  period              = 60
  evaluation_periods  = each.value.periods
  threshold           = each.value.threshold
  comparison_operator = each.key == "aurora-at-ceiling" ? "GreaterThanOrEqualToThreshold" : "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

# ---------------------------------------------------------------------------
# X-Ray
# ---------------------------------------------------------------------------

resource "aws_xray_sampling_rule" "investigations" {
  rule_name      = "${local.name}-runs"
  priority       = 100
  version        = 1
  reservoir_size = 5
  fixed_rate     = 1.0 # every investigation is evidence; trace all of them
  url_path       = "*"
  host           = "*"
  http_method    = "*"
  service_type   = "*"
  service_name   = "${local.name}*"
  resource_arn   = "*"
  tags           = var.tags
}

# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

locals {
  investigation_arn = var.state_machine_arns[0]

  widgets = [
    { title = "Investigations", metrics = [
      ["AWS/States", "ExecutionsStarted", "StateMachineArn", local.investigation_arn],
      [".", "ExecutionsSucceeded", ".", "."],
      [".", "ExecutionsFailed", ".", "."],
    ], stat = "Sum" },
    { title = "Evidence per run · abstention · refutations", metrics = [
      [local.ns, "evidence_items_per_run", "Service", "agents"],
      [".", "abstention_rate", ".", "."],
      [".", "falsifier_refutations", ".", "."],
    ], stat = "Average" },
    { title = "Human override rate — the true north", metrics = [
      [local.ns, "human_override_rate", "Service", "api"],
    ], stat = "Average" },
    { title = "Cost per image (USD) · p95 latency (s)", metrics = [
      [local.ns, "cost_per_image", "Service", "agents"],
      [".", "p95_latency", ".", "."],
    ], stat = "Average" },
    { title = "Bedrock: invocations and throttles", metrics = [
      ["AWS/Bedrock", "Invocations"],
      [".", "InvocationThrottles"],
      [".", "InvocationClientErrors"],
    ], stat = "Sum" },
    { title = "Bedrock: tokens", metrics = [
      ["AWS/Bedrock", "InputTokenCount"],
      [".", "OutputTokenCount"],
    ], stat = "Sum" },
    { title = "Agents: invocations, errors, throttles", metrics = [
      ["AWS/Lambda", "Invocations"],
      [".", "Errors"],
      [".", "Throttles"],
    ], stat = "Sum" },
    { title = "Edge → ALB: requests and 5xx", metrics = [
      ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.alb_arn_suffix],
      [".", "HTTPCode_Target_5XX_Count", ".", "."],
    ], stat = "Sum" },
    { title = "ALB p95 response time (s)", metrics = [
      ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.alb_arn_suffix],
    ], stat = "p95" },
    { title = "Aurora ACU", metrics = [
      ["AWS/RDS", "ServerlessDatabaseCapacity", "DBClusterIdentifier", var.db_cluster_id],
    ], stat = "Maximum" },
  ]
}

resource "aws_cloudwatch_dashboard" "live" {
  dashboard_name = "${local.name}-live"
  dashboard_body = jsonencode({
    widgets = [for i, w in local.widgets : {
      type   = "metric"
      x      = (i % 2) * 12
      y      = floor(i / 2) * 6
      width  = 12
      height = 6
      properties = {
        title   = w.title
        region  = local.region
        stat    = w.stat
        period  = 60
        view    = "timeSeries"
        metrics = w.metrics
      }
    }]
  })
}
