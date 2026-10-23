output "state_bucket" {
  description = "Value for `bucket` in each environment's backend.tf."
  value       = aws_s3_bucket.state.id
}

output "github_oidc_provider_arn" {
  description = "Pass to modules/cicd as github_oidc_provider_arn."
  value       = local.github_oidc_provider_arn
}
