# Module: compute-api
#
# The request path behind CloudFront: one ECS cluster, one internal ALB, two
# services, and the migrate task CI runs before each rollout.
#
#   CloudFront ──VPC Origin──▶ internal ALB ─┬─ /api/*  ─▶ api  (FastAPI :8000)
#                                            └─ /*      ─▶ web  (Next.js :3000)
#
# No API Gateway: the API validates Cognito JWTs itself and serves WebSockets
# directly, so a gateway in front would add a hop, a bill and a second place
# for auth to drift. The ALB has no public address; only CloudFront reaches it.
#
# Images: services track `:latest`, which CI moves after tests pass and
# then forces a new deployment. Until the first image is pushed, desired
# counts are 0 (`api_image_ready` / `web_image_ready`), so the stack applies
# cleanly on day one without crash-looping tasks.

data "aws_region" "current" {}

locals {
  name   = "${var.project}-${var.env}"
  region = data.aws_region.current.region

  api_env = merge({
    ZZ_ENV                       = var.env
    ZZ_REGION                    = local.region
    ZZ_PROJECT                   = var.project
    ZZ_LOG_LEVEL                 = "INFO"
    ZZ_CORS_ORIGINS              = jsonencode(var.public_origins)
    ZZ_TRUSTED_HOSTS             = jsonencode(["*"]) # the ALB is internal; Host is CloudFront's
    ZZ_COGNITO_USER_POOL_ID      = var.cognito_user_pool_id
    ZZ_COGNITO_CLIENT_ID         = var.cognito_client_id
    ZZ_COGNITO_CLIENT_SECRET_REF = "secretsmanager://${var.cognito_client_secret_arn}#client_secret"
    ZZ_GUEST_USERNAME            = var.guest_username
    ZZ_GUEST_PASSWORD_REF        = "secretsmanager://${var.guest_secret_arn}#password"
    ZZ_DATABASE_SECRET_REF       = "secretsmanager://${var.db_app_secret_arn}"
    ZZ_DATABASE_HOST             = var.db_host
    ZZ_DATABASE_NAME             = var.db_name
    ZZ_ASSETS_BUCKET             = var.assets_bucket
    ZZ_ASSETS_KMS_KEY_ID         = var.assets_kms_key_arn
    ZZ_RATE_LIMIT_TABLE          = var.rate_limit_table
    ZZ_CDN_DOMAIN                = var.cdn_domain
  }, var.api_extra_env)
}

# ---------------------------------------------------------------------------
# Cluster
# ---------------------------------------------------------------------------

resource "aws_ecs_cluster" "this" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = var.tags
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

resource "aws_cloudwatch_log_group" "this" {
  for_each = toset(["api", "web", "api-migrate"])

  name              = "/ecs/${local.name}-${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.logs_kms_key_arn
  tags              = var.tags
}

# ---------------------------------------------------------------------------
# Internal ALB
# ---------------------------------------------------------------------------

resource "aws_lb" "this" {
  name               = local.name
  internal           = true
  load_balancer_type = "application"
  subnets            = var.private_subnet_ids
  security_groups    = [var.alb_sg_id]

  drop_invalid_header_fields = true
  idle_timeout               = 300 # long-lived run-stream WebSockets
  enable_deletion_protection = var.deletion_protection

  access_logs {
    bucket  = var.log_bucket
    prefix  = "alb"
    enabled = true
  }

  tags = merge(var.tags, { Name = local.name })
}

resource "aws_lb_target_group" "api" {
  name                 = "${local.name}-api"
  port                 = var.api_port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 30

  health_check {
    path                = "/healthz"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = var.tags
}

resource "aws_lb_target_group" "web" {
  name                 = "${local.name}-web"
  port                 = var.web_port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 30

  health_check {
    path                = "/"
    matcher             = "200-399" # "/" redirects to the locale
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = var.tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = var.alb_listener_port
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }

  tags = var.tags
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  tags = var.tags
}

# ---------------------------------------------------------------------------
# Task definitions
# ---------------------------------------------------------------------------

locals {
  # Read-only root filesystem everywhere; /tmp is the one writable path.
  tmp_volume = "tmp"
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.api_task_role_arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64" # CI builds apps/api for linux/amd64
  }

  volume {
    name = local.tmp_volume
  }

  container_definitions = jsonencode([{
    name                   = "api"
    image                  = "${var.api_repository_url}:latest"
    essential              = true
    readonlyRootFilesystem = true
    user                   = "10001"
    portMappings           = [{ containerPort = var.api_port, protocol = "tcp" }]
    environment            = [for k, v in local.api_env : { name = k, value = v }]
    mountPoints            = [{ sourceVolume = local.tmp_volume, containerPath = "/tmp" }]
    healthCheck = {
      command     = ["CMD-SHELL", "curl -fsS http://localhost:${var.api_port}/healthz || exit 1"]
      interval    = 30
      timeout     = 3
      retries     = 3
      startPeriod = 15
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.this["api"].name
        awslogs-region        = local.region
        awslogs-stream-prefix = "api"
        mode                  = "non-blocking"
      }
    }
  }])

  tags = var.tags
}

# Same image, owner credential, `alembic upgrade head` by default. CI runs it
# (deploy-api.yml) before rolling the service; seed_demo.py runs through it
# too, with a command override.
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name}-api-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.migrate_task_role_arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  volume {
    name = local.tmp_volume
  }

  container_definitions = jsonencode([{
    name                   = "api"
    image                  = "${var.api_repository_url}:latest"
    essential              = true
    readonlyRootFilesystem = true
    user                   = "10001"
    command                = ["alembic", "upgrade", "head"]
    environment = [for k, v in merge(local.api_env, {
      ZZ_SERVICE_NAME        = "migrate"
      ZZ_DATABASE_SECRET_REF = "secretsmanager://${var.db_master_secret_arn}"
      ZZ_APP_DB_SECRET_REF   = "secretsmanager://${var.db_app_secret_arn}"
    }) : { name = k, value = v }]
    mountPoints = [{ sourceVolume = local.tmp_volume, containerPath = "/tmp" }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.this["api-migrate"].name
        awslogs-region        = local.region
        awslogs-stream-prefix = "migrate"
      }
    }
  }])

  tags = var.tags
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${local.name}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.web_cpu
  memory                   = var.web_memory
  execution_role_arn       = var.execution_role_arn
  # No task role: the web tier calls the API, never AWS.

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  volume {
    name = local.tmp_volume
  }

  container_definitions = jsonencode([{
    name                   = "web"
    image                  = "${var.web_repository_url}:latest"
    essential              = true
    readonlyRootFilesystem = false # Next writes its image-optimisation cache under .next/cache
    user                   = "1001"
    portMappings           = [{ containerPort = var.web_port, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = tostring(var.web_port) },
      { name = "HOSTNAME", value = "0.0.0.0" },
      # Server-side rendering reaches the API inside the VPC, through the ALB.
      { name = "API_INTERNAL_URL", value = "http://${aws_lb.this.dns_name}/api/v1" },
    ]
    mountPoints = [{ sourceVolume = local.tmp_volume, containerPath = "/tmp" }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.this["web"].name
        awslogs-region        = local.region
        awslogs-stream-prefix = "web"
        mode                  = "non-blocking"
      }
    }
  }])

  tags = var.tags
}

# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------

locals {
  services = {
    api = {
      task_definition = aws_ecs_task_definition.api.arn
      target_group    = aws_lb_target_group.api.arn
      container_port  = var.api_port
      security_group  = var.api_sg_id
      desired         = var.api_image_ready ? var.api_min_tasks : 0
      min             = var.api_image_ready ? var.api_min_tasks : 0
      max             = var.api_max_tasks
    }
    web = {
      task_definition = aws_ecs_task_definition.web.arn
      target_group    = aws_lb_target_group.web.arn
      container_port  = var.web_port
      security_group  = var.web_sg_id
      desired         = var.web_image_ready ? var.web_min_tasks : 0
      min             = var.web_image_ready ? var.web_min_tasks : 0
      max             = var.web_max_tasks
    }
  }
}

resource "aws_ecs_service" "this" {
  for_each = local.services

  name                              = "${local.name}-${each.key}"
  cluster                           = aws_ecs_cluster.this.id
  task_definition                   = each.value.task_definition
  desired_count                     = each.value.desired
  launch_type                       = "FARGATE"
  platform_version                  = "LATEST"
  propagate_tags                    = "SERVICE"
  enable_ecs_managed_tags           = true
  health_check_grace_period_seconds = 30

  # A bad image rolls itself back instead of taking the pitch down.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [each.value.security_group]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = each.value.target_group
    container_name   = each.key
    container_port   = each.value.container_port
  }

  tags = merge(var.tags, { Service = each.key })

  lifecycle {
    # Autoscaling owns the count once running.
    ignore_changes = [desired_count]
  }

  depends_on = [aws_lb_listener.http, aws_lb_listener_rule.api]
}

resource "aws_appautoscaling_target" "this" {
  for_each = local.services

  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.this[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = each.value.min
  max_capacity       = each.value.max
}

resource "aws_appautoscaling_policy" "requests" {
  for_each = local.services

  name               = "${local.name}-${each.key}-requests"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this[each.key].service_namespace
  resource_id        = aws_appautoscaling_target.this[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.this[each.key].scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = var.requests_per_task_target
    scale_in_cooldown  = 120
    scale_out_cooldown = 30 # an audience scanning a QR code arrives all at once

    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.this.arn_suffix}/${each.key == "api" ? aws_lb_target_group.api.arn_suffix : aws_lb_target_group.web.arn_suffix}"
    }
  }
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each = local.services

  name               = "${local.name}-${each.key}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this[each.key].service_namespace
  resource_id        = aws_appautoscaling_target.this[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.this[each.key].scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 120
    scale_out_cooldown = 30

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
