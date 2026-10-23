# Outputs consumed by the environment root module.
# Every cross-module reference goes through an explicit output — no remote-state
# lookups between modules inside the same environment.

output "deploy_role_arn" {
  description = "GitHub secret AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.deploy.arn
}
