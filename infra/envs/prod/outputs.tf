# What the application, CI and the pitch need.

output "app_url" {
  description = "The QR code on the last slide points here."
  value       = module.frontend.app_url
}

output "dashboard_url" {
  value = module.observability.dashboard_url
}

output "cloudfront_distribution_id" {
  value = module.frontend.distribution_id
}

output "vpc_id" {
  value = module.network.vpc_id
}

output "nat_public_ip" {
  description = "Single egress IP, for external APIs that allowlist callers."
  value       = module.network.nat_public_ip
}

output "user_pool_id" {
  value = module.auth.user_pool_id
}

output "user_pool_client_id" {
  value = module.auth.web_client_id
}

output "repository_urls" {
  value = module.registry.repository_urls
}

output "ecs_cluster" {
  value = module.compute_api.cluster_name
}

output "state_machine_arn" {
  description = "GitHub secret INVESTIGATION_STATE_MACHINE_ARN."
  value       = module.orchestration.investigation_state_machine_arn
}

output "deploy_role_arn" {
  description = "GitHub secret AWS_DEPLOY_ROLE_ARN."
  value       = module.cicd.deploy_role_arn
}

output "migrate_network_configuration" {
  description = "GitHub variable ECS_MIGRATE_NETWORK_CONFIG."
  value       = module.compute_api.migrate_network_configuration
}

output "buckets" {
  value = module.storage.bucket_names
}

output "tables" {
  value = module.keyvalue.table_names
}

output "kms_key_arns" {
  value = module.security.kms_key_arns
}

output "role_arns" {
  value = module.security.role_arns
}

output "db_cluster_arn" {
  value = module.database.cluster_arn
}

output "db_master_secret_arn" {
  value = module.database.master_secret_arn
}

output "db_app_secret_arn" {
  value = module.database.app_secret_arn
}

output "db_name" {
  value = module.database.database_name
}

output "access_logs_bucket" {
  value = module.storage.access_logs_bucket
}
