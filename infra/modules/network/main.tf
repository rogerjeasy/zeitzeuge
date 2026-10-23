# Module: network
#
# Private network foundation. Everything with an ENI lives here; nothing else
# creates subnets or security groups.
#
# Three tiers per AZ, two AZs:
#   public   only the NAT gateway; the ALB is internal, nothing takes a public IP
#   private  Fargate tasks (web, API, deep agents), the internal ALB, interface endpoints
#   data     Aurora only; NO route to the internet, not even through the NAT
#
# One NAT gateway, not one per AZ: a deliberate single point of failure for a
# project with a 24-hour lifespan, said out loud rather than hidden. Losing its
# AZ loses egress to external APIs (swisstopo, Wikidata); AWS traffic keeps
# flowing through the VPC endpoints.

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  name       = "${var.project}-${var.env}"
  region     = data.aws_region.current.region
  account_id = data.aws_caller_identity.current.account_id
  azs        = slice(var.availability_zones, 0, 2)

  # 10.20.0.0/16, carved so each tier can grow without renumbering:
  #   public   10.20.0.0/24,  10.20.1.0/24
  #   private  10.20.16.0/20, 10.20.32.0/20   (4k IPs each: awsvpc gives every task an ENI)
  #   data     10.20.64.0/24, 10.20.65.0/24
  public_cidrs  = [for i, _ in local.azs : cidrsubnet(var.cidr_block, 8, i)]
  private_cidrs = [for i, _ in local.azs : cidrsubnet(var.cidr_block, 4, i + 1)]
  data_cidrs    = [for i, _ in local.azs : cidrsubnet(var.cidr_block, 8, 64 + i)]
}

# ---------------------------------------------------------------------------
# VPC
# ---------------------------------------------------------------------------

resource "aws_vpc" "this" {
  cidr_block           = var.cidr_block
  enable_dns_support   = true
  enable_dns_hostnames = true # required for interface endpoints' private DNS

  tags = merge(var.tags, { Name = local.name })
}

# CIS AWS Foundations 5.4: the default security group allows nothing. Anything
# that forgets to name a security group gets no network at all, not everything.
resource "aws_default_security_group" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${local.name}-default-deny" })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = local.name })
}

# ---------------------------------------------------------------------------
# Subnets
# ---------------------------------------------------------------------------

resource "aws_subnet" "public" {
  count = length(local.azs)

  vpc_id            = aws_vpc.this.id
  cidr_block        = local.public_cidrs[count.index]
  availability_zone = local.azs[count.index]

  # Nothing we run takes a public IP; the NAT gateway gets an Elastic IP.
  map_public_ip_on_launch = false

  tags = merge(var.tags, { Name = "${local.name}-public-${local.azs[count.index]}", Tier = "public" })
}

resource "aws_subnet" "private" {
  count = length(local.azs)

  vpc_id            = aws_vpc.this.id
  cidr_block        = local.private_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(var.tags, { Name = "${local.name}-private-${local.azs[count.index]}", Tier = "private" })
}

resource "aws_subnet" "data" {
  count = length(local.azs)

  vpc_id            = aws_vpc.this.id
  cidr_block        = local.data_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(var.tags, { Name = "${local.name}-data-${local.azs[count.index]}", Tier = "data" })
}

# ---------------------------------------------------------------------------
# Egress: one NAT gateway
# ---------------------------------------------------------------------------

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = merge(var.tags, { Name = "${local.name}-nat" })

  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  tags          = merge(var.tags, { Name = local.name })

  depends_on = [aws_internet_gateway.this]
}

# ---------------------------------------------------------------------------
# Routing
# ---------------------------------------------------------------------------

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${local.name}-public" })
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  count          = length(local.azs)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${local.name}-private" })
}

resource "aws_route" "private_nat" {
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this.id
}

resource "aws_route_table_association" "private" {
  count          = length(local.azs)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# The data tier has a route table with the local route and the gateway
# endpoints, and nothing else. A compromised database cannot reach the internet.
resource "aws_route_table" "data" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${local.name}-data" })
}

resource "aws_route_table_association" "data" {
  count          = length(local.azs)
  subnet_id      = aws_subnet.data[count.index].id
  route_table_id = aws_route_table.data.id
}

# ---------------------------------------------------------------------------
# Gateway endpoints (free) — with a data perimeter
# ---------------------------------------------------------------------------

# Only this account's buckets are reachable from inside the VPC, plus the
# AWS-owned bucket ECR serves image layers from. Exfiltration to an attacker's
# bucket fails at the network edge, whatever credentials a task holds.
data "aws_iam_policy_document" "s3_endpoint" {
  statement {
    sid       = "OwnAccountBucketsOnly"
    actions   = ["s3:*"]
    resources = ["*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [local.account_id]
    }
  }

  statement {
    sid       = "EcrImageLayers"
    actions   = ["s3:GetObject"]
    resources = ["arn:aws:s3:::prod-${local.region}-starport-layer-bucket/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }
  }
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${local.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id, aws_route_table.data.id]
  policy            = data.aws_iam_policy_document.s3_endpoint.json

  tags = merge(var.tags, { Name = "${local.name}-s3" })
}

data "aws_iam_policy_document" "dynamodb_endpoint" {
  statement {
    sid       = "OwnAccountTablesOnly"
    actions   = ["dynamodb:*"]
    resources = ["*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${local.region}.dynamodb"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id, aws_route_table.data.id]
  policy            = data.aws_iam_policy_document.dynamodb_endpoint.json

  tags = merge(var.tags, { Name = "${local.name}-dynamodb" })
}

# ---------------------------------------------------------------------------
# Interface endpoints (billed per AZ-hour) — AWS traffic stays off the NAT
# ---------------------------------------------------------------------------

# Model traffic from the VPC is pinned to the EU at the network layer too:
# even a role that somehow held permission for a global.* profile would be
# refused here. Defense in depth over the IAM Deny.
data "aws_iam_policy_document" "bedrock_runtime_endpoint" {
  statement {
    sid       = "OwnAccountPrincipalsOnly"
    actions   = ["bedrock:*"]
    resources = ["*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalAccount"
      values   = [local.account_id]
    }
  }

  statement {
    sid       = "NeverRouteOutsideTheEU"
    effect    = "Deny"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["arn:aws:bedrock:*:*:inference-profile/global.*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }
  }
}

resource "aws_vpc_endpoint" "interface" {
  for_each = toset(var.interface_endpoints)

  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${local.region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.endpoints.id]
  policy              = each.key == "bedrock-runtime" ? data.aws_iam_policy_document.bedrock_runtime_endpoint.json : null

  tags = merge(var.tags, { Name = "${local.name}-${each.key}" })
}

# ---------------------------------------------------------------------------
# Security groups — referenced by id, never by CIDR, so a rule reads as intent
# ---------------------------------------------------------------------------
#
#   CloudFront ──VPC Origin──▶ alb ──3000──▶ web ──80──▶ alb (SSR calls the API)
#                               └──8000──▶ api ──5432──▶ db
#                                           │
#                                  agents ──┴──443──▶ endpoints / NAT
#
# The ALB's ingress from CloudFront is added by the frontend module: its source
# is the security group CloudFront creates for the VPC Origin.
#
# Every group starts empty; the rules below are the whole graph.

resource "aws_security_group" "web" {
  name        = "${local.name}-web"
  description = "Next.js server tasks. Reachable only from the ALB."
  vpc_id      = aws_vpc.this.id
  tags        = merge(var.tags, { Name = "${local.name}-web" })
}

resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Internal ALB. Reachable only from the CloudFront VPC Origin and the web tasks."
  vpc_id      = aws_vpc.this.id
  tags        = merge(var.tags, { Name = "${local.name}-alb" })
}

resource "aws_security_group" "api" {
  name        = "${local.name}-api"
  description = "FastAPI tasks. Reachable only from the ALB."
  vpc_id      = aws_vpc.this.id
  tags        = merge(var.tags, { Name = "${local.name}-api" })
}

resource "aws_security_group" "agents" {
  name        = "${local.name}-agents"
  description = "Deep-agent Fargate tasks. No inbound at all; started by Step Functions."
  vpc_id      = aws_vpc.this.id
  tags        = merge(var.tags, { Name = "${local.name}-agents" })
}

resource "aws_security_group" "db" {
  name        = "${local.name}-db"
  description = "Aurora PostgreSQL. Reachable only from the API and agent tasks."
  vpc_id      = aws_vpc.this.id
  tags        = merge(var.tags, { Name = "${local.name}-db" })
}

resource "aws_security_group" "endpoints" {
  name        = "${local.name}-endpoints"
  description = "Interface VPC endpoints. HTTPS from workloads only."
  vpc_id      = aws_vpc.this.id
  tags        = merge(var.tags, { Name = "${local.name}-endpoints" })
}

# ALB <-> web
resource "aws_vpc_security_group_egress_rule" "alb_to_web" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.web.id
  ip_protocol                  = "tcp"
  from_port                    = var.web_port
  to_port                      = var.web_port
  description                  = "to Next.js tasks"
}

resource "aws_vpc_security_group_ingress_rule" "web_from_alb" {
  security_group_id            = aws_security_group.web.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = var.web_port
  to_port                      = var.web_port
  description                  = "from internal ALB"
}

# Server-side rendering calls the API through the same ALB, never around it.
resource "aws_vpc_security_group_egress_rule" "web_to_alb" {
  security_group_id            = aws_security_group.web.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = var.alb_listener_port
  to_port                      = var.alb_listener_port
  description                  = "SSR to the API via the ALB"
}

resource "aws_vpc_security_group_ingress_rule" "alb_from_web" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.web.id
  ip_protocol                  = "tcp"
  from_port                    = var.alb_listener_port
  to_port                      = var.alb_listener_port
  description                  = "SSR from web tasks"
}

resource "aws_vpc_security_group_egress_rule" "web_https" {
  security_group_id = aws_security_group.web.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "HTTPS: VPC endpoints (image pull, logs)"
}

# ALB -> API
resource "aws_vpc_security_group_egress_rule" "alb_to_api" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.api.id
  ip_protocol                  = "tcp"
  from_port                    = var.api_port
  to_port                      = var.api_port
  description                  = "to FastAPI tasks"
}

resource "aws_vpc_security_group_ingress_rule" "api_from_alb" {
  security_group_id            = aws_security_group.api.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = var.api_port
  to_port                      = var.api_port
  description                  = "from internal ALB"
}

# API + agents -> DB
resource "aws_vpc_security_group_ingress_rule" "db_from_workloads" {
  for_each = {
    api    = aws_security_group.api.id
    agents = aws_security_group.agents.id
  }

  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL from ${each.key}"
}

resource "aws_vpc_security_group_egress_rule" "workloads_to_db" {
  for_each = {
    api    = aws_security_group.api.id
    agents = aws_security_group.agents.id
  }

  security_group_id            = each.value
  referenced_security_group_id = aws_security_group.db.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "to Aurora"
}

# API + agents -> HTTPS (interface endpoints, gateway-endpoint prefix lists,
# and external APIs through the NAT). HTTPS only: no plain-HTTP egress at all.
resource "aws_vpc_security_group_egress_rule" "workloads_https" {
  for_each = {
    api    = aws_security_group.api.id
    agents = aws_security_group.agents.id
  }

  security_group_id = each.value
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "HTTPS: VPC endpoints, S3/DynamoDB, external APIs via NAT"
}

resource "aws_vpc_security_group_ingress_rule" "endpoints_from_workloads" {
  for_each = {
    web    = aws_security_group.web.id
    api    = aws_security_group.api.id
    agents = aws_security_group.agents.id
  }

  security_group_id            = aws_security_group.endpoints.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  description                  = "HTTPS from ${each.key}"
}

# ---------------------------------------------------------------------------
# Flow logs — to S3 (no IAM role, cheaper than CloudWatch)
# ---------------------------------------------------------------------------

resource "aws_flow_log" "this" {
  count = var.flow_logs_enabled ? 1 : 0

  vpc_id                   = aws_vpc.this.id
  traffic_type             = "ALL"
  log_destination_type     = "s3"
  log_destination          = "${var.flow_logs_bucket_arn}/vpc-flow-logs/"
  max_aggregation_interval = 600

  destination_options {
    file_format                = "parquet"
    per_hour_partition         = true
    hive_compatible_partitions = true
  }

  tags = merge(var.tags, { Name = local.name })
}
