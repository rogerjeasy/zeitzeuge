# Module: database
#
# Aurora PostgreSQL Serverless v2: the system of record — tenants, records,
# evidence ledger, agent runs, the Schwyz gazetteer (pgvector), and the
# RLS policies that make tenant isolation a database property.
#
# Two credentials, two owners:
#   master   RDS owns it (manage_master_user_password): generated, stored in
#            Secrets Manager under the secrets CMK, rotated by RDS. Only the
#            migrate task reads it.
#   app      zeitzeuge_app — NOSUPERUSER, NOBYPASSRLS, not the table owner, so
#            every RLS policy applies to it. Generated here, stored in the
#            db/app container the security module created; the migrate task
#            creates the role from it. The API and agents only ever hold this.
#
# pgvector, RLS policies and grants are schema, not infrastructure: they live
# in apps/api/migrations. This module's contract ends at a reachable endpoint
# and two secret ARNs.

data "aws_region" "current" {}

locals {
  name   = "${var.project}-${var.env}"
  region = data.aws_region.current.region
}

resource "aws_db_subnet_group" "this" {
  name        = local.name
  description = "Data tier: no route to the internet."
  subnet_ids  = var.subnet_ids
  tags        = merge(var.tags, { Name = local.name })
}

resource "aws_rds_cluster_parameter_group" "this" {
  name        = "${local.name}-pg16"
  family      = "aurora-postgresql16"
  description = "TLS enforced, statement stats, slow-query logging."

  # Plain-text connections are refused, even from inside the VPC.
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  # Connection audit for the security story; cheap at this scale.
  parameter {
    name  = "log_connections"
    value = "1"
  }

  tags = var.tags
}

# Created before the cluster so it gets a retention and the logs CMK, instead
# of the never-expiring, unencrypted group RDS would create on its own.
resource "aws_cloudwatch_log_group" "postgresql" {
  name              = "/aws/rds/cluster/${local.name}/postgresql"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.logs_kms_key_arn
  tags              = var.tags
}

resource "aws_rds_cluster" "this" {
  cluster_identifier = local.name
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned"
  engine_version     = var.engine_version
  database_name      = var.database_name

  master_username               = "zeitzeuge_admin"
  manage_master_user_password   = true
  master_user_secret_kms_key_id = var.secrets_kms_key_arn

  db_subnet_group_name            = aws_db_subnet_group.this.name
  vpc_security_group_ids          = [var.security_group_id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.this.name

  storage_encrypted = true
  kms_key_id        = var.kms_key_arn

  # Scale to zero when idle; the first query after a pause waits ~15 s for
  # resume. Raise min_capacity to 0.5 for the event so the pitch never waits.
  serverlessv2_scaling_configuration {
    min_capacity             = var.min_capacity
    max_capacity             = var.max_capacity
    seconds_until_auto_pause = var.min_capacity == 0 ? var.seconds_until_auto_pause : null
  }

  # The Data API is what keeps the Lambda agents out of the VPC: they query
  # over HTTPS with IAM + the app secret, no ENI, no cold-start penalty.
  enable_http_endpoint                = true
  iam_database_authentication_enabled = true

  backup_retention_period      = var.backup_retention_days
  preferred_backup_window      = "01:00-02:00"
  preferred_maintenance_window = "sun:02:30-sun:03:30"
  copy_tags_to_snapshot        = true

  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name}-final"

  enabled_cloudwatch_logs_exports = ["postgresql"]

  tags = merge(var.tags, { Name = local.name })

  depends_on = [aws_cloudwatch_log_group.postgresql]

  lifecycle {
    ignore_changes = [final_snapshot_identifier]
  }
}

resource "aws_rds_cluster_instance" "writer" {
  identifier         = "${local.name}-writer"
  cluster_identifier = aws_rds_cluster.this.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.this.engine
  engine_version     = aws_rds_cluster.this.engine_version

  publicly_accessible        = false
  auto_minor_version_upgrade = true

  tags = merge(var.tags, { Name = "${local.name}-writer" })
}

# ---------------------------------------------------------------------------
# The application credential
# ---------------------------------------------------------------------------

resource "random_password" "app" {
  length  = 40
  special = false # safe inside a DSN without escaping, 238 bits of entropy
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = var.app_secret_arn
  secret_string = jsonencode({
    engine   = "postgres"
    username = "zeitzeuge_app"
    password = random_password.app.result
    host     = aws_rds_cluster.this.endpoint
    port     = tostring(aws_rds_cluster.this.port)
    dbname   = var.database_name
  })
}
