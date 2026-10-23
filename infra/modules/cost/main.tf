# Module: cost
#
# Three independent trip wires against the USD 2000 credit:
#
#   1. account budget   gross monthly cost vs the credit: 25/50/75/90 % actual,
#                       100 % forecast. Account-wide on purpose — the credit is
#                       shared with every other project in this account.
#   2. Bedrock budget   the one service whose spend scales with traffic, not
#                       with time
#   3. billing alarm    CloudWatch EstimatedCharges (us-east-1 only), in case
#                       Budgets' ~8-hourly refresh is too slow on the day
#
# The trap this module avoids: Budgets subtract credits by default. With a
# credit absorbing every charge, a default budget sees USD 0 and never fires.
# Every budget here excludes credits and refunds (cost_types), so the
# thresholds measure consumption of the credit, not the invoice.

locals {
  name = "${var.project}-${var.env}"

  thresholds = [25, 50, 75, 90]
}

resource "aws_budgets_budget" "account" {
  name         = "${local.name}-credit"
  budget_type  = "COST"
  limit_amount = tostring(var.limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit  = false
    include_refund  = false
    include_support = true
    include_tax     = true
  }

  dynamic "notification" {
    for_each = local.thresholds
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [var.alarm_email]
    }
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alarm_email]
  }

  tags = var.tags
}

resource "aws_budgets_budget" "bedrock" {
  name         = "${local.name}-bedrock"
  budget_type  = "COST"
  limit_amount = tostring(var.bedrock_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "Service"
    values = ["Amazon Bedrock"]
  }

  cost_types {
    include_credit = false
    include_refund = false
  }

  dynamic "notification" {
    for_each = [50, 80, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [var.alarm_email]
    }
  }

  tags = var.tags
}

# ---------------------------------------------------------------------------
# Billing alarm — the metric exists only in us-east-1, so the topic does too
# ---------------------------------------------------------------------------

resource "aws_sns_topic" "billing" {
  provider = aws.us_east_1

  name = "${local.name}-billing"
  tags = var.tags
}

resource "aws_sns_topic_subscription" "billing_email" {
  provider = aws.us_east_1

  topic_arn = aws_sns_topic.billing.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_metric_alarm" "billing" {
  provider = aws.us_east_1

  alarm_name          = "${local.name}-estimated-charges"
  alarm_description   = "Month-to-date estimated charges passed ${var.billing_alarm_usd} USD. Needs 'Receive CloudWatch billing alerts' on in Billing preferences."
  namespace           = "AWS/Billing"
  metric_name         = "EstimatedCharges"
  dimensions          = { Currency = "USD" }
  statistic           = "Maximum"
  period              = 21600
  evaluation_periods  = 1
  threshold           = var.billing_alarm_usd
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.billing.arn]
  tags                = var.tags
}

# ---------------------------------------------------------------------------
# Cost allocation tags — so Cost Explorer can split ZEITZEUGE from the rest
# ---------------------------------------------------------------------------
#
# A tag key can only be activated after it has appeared in billing data
# (~24 h after the first tagged resource bills). Off by default so the first
# apply cannot fail on it; flip on after the stack has run for a day.

resource "aws_ce_cost_allocation_tag" "this" {
  for_each = var.activate_cost_allocation_tags ? toset(["Project", "Env", "Service", "Agent", "ModelTier"]) : toset([])

  tag_key = each.key
  status  = "Active"
}
