# Outputs consumed by the environment root module.
# Every cross-module reference goes through an explicit output — no remote-state
# lookups between modules inside the same environment.

output "user_pool_id" {
  value = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  value = aws_cognito_user_pool.this.arn
}

output "web_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "web_client_secret_arn" {
  description = "Secrets Manager, not a plain output: {client_id, client_secret}."
  value       = aws_secretsmanager_secret.this["web"].arn
}

output "guest_secret_arn" {
  value = aws_secretsmanager_secret.this["guest"].arn
}

output "harvester_secret_arn" {
  value = aws_secretsmanager_secret.this["harvester"].arn
}

output "domain" {
  value = "${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
}

output "guest_username" {
  value = var.guest_username
}
