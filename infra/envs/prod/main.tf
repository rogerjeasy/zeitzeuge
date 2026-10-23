# ---------------------------------------------------------------------------
# ZEITZEUGE — prod, the only environment
#
# Module call order mirrors the dependency graph, top to bottom:
#
#   network ─┬─ security ─┬─ storage ─────────────────────────┐
#            │            ├─ database, keyvalue, search       │
#            │            ├─ auth (Cognito)                   │
#            │            └─ bedrock (guardrail, profiles)    │
#            ├─ registry                                      │
#            ├─ compute-api (cluster, ALB, api, web) ──── frontend (CloudFront, WAF)
#            ├─ compute-agents, inference                     │
#            └─ orchestration (Step Functions) ───────────────┘
#                         └─ observability · cost · cicd
#
# Modules never call each other; every edge below is an explicit output → input.
# ---------------------------------------------------------------------------

data "aws_caller_identity" "current" {}

locals {
  name       = "${var.project}-${var.env}"
  account_id = data.aws_caller_identity.current.account_id

  tags = {
    Project   = var.project
    Env       = var.env
    ManagedBy = "terraform"
    Repo      = var.github_repo
  }

  # Root-managed (policies/boundary.json); Terraform references it, never edits it.
  permissions_boundary_arn = "arn:aws:iam::${local.account_id}:policy/ZeitzeugeBoundary"

  # The browser's origins: the public edge, plus local development.
  public_origins = concat(["https://${module.frontend.domain_name}"], var.extra_cors_origins)
}

# --- Foundation -------------------------------------------------------------

module "network" {
  source  = "../../modules/network"
  project = var.project
  env     = var.env
  tags    = local.tags

  interface_endpoints  = var.interface_endpoints
  flow_logs_enabled    = true
  flow_logs_bucket_arn = module.storage.access_logs_bucket_arn
}

module "security" {
  source  = "../../modules/security"
  project = var.project
  env     = var.env
  tags    = local.tags

  permissions_boundary_arn = local.permissions_boundary_arn
  cognito_user_pool_arn    = module.auth.user_pool_arn
}

# --- Data -------------------------------------------------------------------

module "storage" {
  source  = "../../modules/storage"
  project = var.project
  env     = var.env
  tags    = local.tags

  kms_key_arn          = module.security.kms_key_arns["assets"]
  cors_allowed_origins = local.public_origins
}

module "database" {
  source  = "../../modules/database"
  project = var.project
  env     = var.env
  tags    = local.tags

  subnet_ids          = module.network.data_subnet_ids
  security_group_id   = module.network.db_sg_id
  kms_key_arn         = module.security.kms_key_arns["database"]
  secrets_kms_key_arn = module.security.kms_key_arns["secrets"]
  logs_kms_key_arn    = module.security.kms_key_arns["logs"]
  app_secret_arn      = module.security.secret_arns["db/app"]
  min_capacity        = var.db_min_capacity
  max_capacity        = var.db_max_capacity
  deletion_protection = var.deletion_protection
}

module "keyvalue" {
  source  = "../../modules/keyvalue"
  project = var.project
  env     = var.env
  tags    = local.tags

  kms_key_arn         = module.security.kms_key_arns["database"]
  deletion_protection = var.deletion_protection
}

module "search" {
  source  = "../../modules/search"
  project = var.project
  env     = var.env
  tags    = local.tags

  enabled          = var.search_enabled
  kms_key_arn      = module.security.kms_key_arns["search"]
  access_role_arns = [module.security.ecs_task_api_role_arn, module.security.lambda_agent_role_arn, module.security.ecs_task_agents_role_arn]
}

# --- Identity ---------------------------------------------------------------

module "auth" {
  source  = "../../modules/auth"
  project = var.project
  env     = var.env
  tags    = local.tags

  pre_token_role_arn  = module.security.cognito_pre_token_role_arn
  secrets_kms_key_arn = module.security.kms_key_arns["secrets"]
  logs_kms_key_arn    = module.security.kms_key_arns["logs"]
  deletion_protection = var.deletion_protection
}

# --- Models -----------------------------------------------------------------

module "bedrock" {
  source  = "../../modules/bedrock"
  project = var.project
  env     = var.env
  tags    = local.tags

  kms_key_arn      = module.security.kms_key_arns["secrets"]
  logs_kms_key_arn = module.security.kms_key_arns["logs"]
  logging_role_arn = module.security.bedrock_logging_role_arn
  log_bucket       = module.storage.access_logs_bucket
}

# --- Compute ----------------------------------------------------------------

module "registry" {
  source  = "../../modules/registry"
  project = var.project
  env     = var.env
  tags    = local.tags
}

module "compute_api" {
  source  = "../../modules/compute-api"
  project = var.project
  env     = var.env
  tags    = local.tags

  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  alb_sg_id          = module.network.alb_sg_id
  api_sg_id          = module.network.api_sg_id
  web_sg_id          = module.network.web_sg_id

  execution_role_arn    = module.security.ecs_task_execution_role_arn
  api_task_role_arn     = module.security.ecs_task_api_role_arn
  migrate_task_role_arn = module.security.ecs_task_migrate_role_arn

  api_repository_url = module.registry.repository_urls["api"]
  web_repository_url = module.registry.repository_urls["web"]
  api_image_ready    = var.api_image_ready
  web_image_ready    = var.web_image_ready
  api_min_tasks      = var.api_min_tasks
  web_min_tasks      = var.web_min_tasks

  public_origins            = local.public_origins
  cdn_domain                = module.frontend.domain_name
  cognito_user_pool_id      = module.auth.user_pool_id
  cognito_client_id         = module.auth.web_client_id
  cognito_client_secret_arn = module.auth.web_client_secret_arn
  guest_username            = module.auth.guest_username
  guest_secret_arn          = module.auth.guest_secret_arn
  db_app_secret_arn         = module.database.app_secret_arn
  db_master_secret_arn      = module.database.master_secret_arn
  db_host                   = module.database.cluster_endpoint
  db_name                   = module.database.database_name
  assets_bucket             = module.storage.assets_bucket
  assets_kms_key_arn        = module.security.kms_key_arns["assets"]
  rate_limit_table          = module.keyvalue.table_names["rate-limit"]

  api_extra_env = {
    ZZ_INVESTIGATION_STATE_MACHINE_ARN = module.orchestration.investigation_state_machine_arn
    ZZ_ORIGINALS_BUCKET                = module.storage.originals_bucket
    ZZ_DERIVATIVES_BUCKET              = module.storage.derivatives_bucket
    ZZ_EXPORTS_BUCKET                  = module.storage.bucket_names["exports"]
    ZZ_RUN_LOCKS_TABLE                 = module.keyvalue.table_names["run-locks"]
    ZZ_IDEMPOTENCY_TABLE               = module.keyvalue.table_names["idempotency"]
  }

  logs_kms_key_arn    = module.security.kms_key_arns["logs"]
  log_bucket          = module.storage.access_logs_bucket
  deletion_protection = var.deletion_protection
}

module "compute_agents" {
  source  = "../../modules/compute-agents"
  project = var.project
  env     = var.env
  tags    = local.tags

  agents_image_ready    = var.agents_image_ready
  agents_repository_url = module.registry.repository_urls["agents"]
  lambda_role_arn       = module.security.lambda_agent_role_arn
  ecs_task_role_arn     = module.security.ecs_task_agents_role_arn
  execution_role_arn    = module.security.ecs_task_execution_role_arn

  db_cluster_arn           = module.database.cluster_arn
  db_app_secret_arn        = module.database.app_secret_arn
  db_name                  = module.database.database_name
  bucket_names             = module.storage.bucket_names
  table_names              = module.keyvalue.table_names
  guardrail_id             = module.bedrock.guardrail_id
  guardrail_version        = module.bedrock.guardrail_version
  inference_profile_arns   = module.bedrock.inference_profile_arns
  external_keys_secret_arn = module.security.secret_arns["external/api-keys"]
  extra_env = {
    ZZ_FALSIFIER_ENDPOINT = module.inference.falsifier_endpoint_name
    ZZ_SEARCH_ENDPOINT    = var.search_enabled ? module.search.collection_endpoint : ""
  }

  reserved_concurrency = var.agent_reserved_concurrency
  warm_enabled         = var.warm_agents
  logs_kms_key_arn     = module.security.kms_key_arns["logs"]
}

module "inference" {
  source  = "../../modules/inference"
  project = var.project
  env     = var.env
  tags    = local.tags

  falsifier_image_ready    = var.falsifier_image_ready
  falsifier_repository_url = module.registry.repository_urls["falsifier"]
  execution_role_arn       = module.security.sagemaker_exec_role_arn
  dem_cache_bucket         = module.storage.bucket_names["dem-cache"]
  region                   = var.region
}

# --- The spine --------------------------------------------------------------

module "orchestration" {
  source  = "../../modules/orchestration"
  project = var.project
  env     = var.env
  tags    = local.tags

  role_arn                = module.security.sfn_orchestrator_role_arn
  agent_function_arns     = module.compute_agents.function_arns
  falsifier_endpoint_name = module.inference.falsifier_endpoint_name
  inventory_bucket        = module.storage.sfn_inventory_bucket
  kms_key_arn             = module.security.kms_key_arns["assets"]
  logs_kms_key_arn        = module.security.kms_key_arns["logs"]
}

# --- Edge -------------------------------------------------------------------

module "frontend" {
  source  = "../../modules/frontend"
  project = var.project
  env     = var.env
  tags    = local.tags

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  vpc_id         = module.network.vpc_id
  alb_arn        = module.compute_api.alb_arn
  alb_dns_name   = module.compute_api.alb_dns_name
  alb_sg_id      = module.network.alb_sg_id
  log_bucket_arn = module.storage.access_logs_bucket_arn
  domain_name    = var.domain_name
  hosted_zone_id = var.hosted_zone_id
}

# --- Cross-cutting ----------------------------------------------------------

module "observability" {
  source  = "../../modules/observability"
  project = var.project
  env     = var.env
  tags    = local.tags

  account_id                 = local.account_id
  alarm_email                = var.alarm_email
  kms_key_arn                = module.security.kms_key_arns["logs"]
  alb_arn_suffix             = module.compute_api.alb_arn_suffix
  target_group_arn_suffixes  = module.compute_api.target_group_arn_suffixes
  state_machine_arns         = module.orchestration.state_machine_arns
  db_cluster_id              = module.database.cluster_id
  db_max_capacity            = var.db_max_capacity
  falsifier_endpoint_enabled = var.falsifier_image_ready
  falsifier_endpoint_name    = module.inference.falsifier_endpoint_name
}

module "cost" {
  source  = "../../modules/cost"
  project = var.project
  env     = var.env
  tags    = local.tags

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  alarm_email                   = var.alarm_email
  limit_usd                     = var.budget_limit_usd
  activate_cost_allocation_tags = var.activate_cost_allocation_tags
}

module "cicd" {
  source  = "../../modules/cicd"
  project = var.project
  env     = var.env
  tags    = local.tags

  github_repo              = var.github_repo
  github_subject_prefix    = var.github_subject_prefix
  github_oidc_provider_arn = var.github_oidc_provider_arn
  permissions_boundary_arn = local.permissions_boundary_arn
}
