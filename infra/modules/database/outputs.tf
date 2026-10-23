# Outputs consumed by the environment root module.
# Every cross-module reference goes through an explicit output — no remote-state
# lookups between modules inside the same environment.

output "cluster_arn" {
  value = aws_rds_cluster.this.arn
}

output "cluster_id" {
  value = aws_rds_cluster.this.id
}

output "cluster_endpoint" {
  value = aws_rds_cluster.this.endpoint
}

output "port" {
  value = aws_rds_cluster.this.port
}

output "database_name" {
  value = var.database_name
}

output "master_secret_arn" {
  description = "RDS-managed; read by the migrate task only."
  value       = aws_rds_cluster.this.master_user_secret[0].secret_arn
}

output "app_secret_arn" {
  description = "zeitzeuge_app credential; what the API and the agents hold."
  value       = var.app_secret_arn
}
