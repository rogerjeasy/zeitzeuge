# Outputs consumed by the environment root module.
# Every cross-module reference goes through an explicit output — no remote-state
# lookups between modules inside the same environment.

output "kms_key_arns" {
  description = "Key ARN per data domain: assets, database, search, logs, secrets."
  value       = { for k, v in aws_kms_key.this : k => v.arn }
}

output "secret_arns" {
  description = "Secret container ARNs: db/app, external/api-keys."
  value       = { for k, v in aws_secretsmanager_secret.this : k => v.arn }
}

output "role_arns" {
  description = "Runtime role ARN by short name."
  value       = { for k, v in aws_iam_role.this : k => v.arn }
}

output "ecs_task_execution_role_arn" {
  value = aws_iam_role.this["ecs-task-execution"].arn
}

output "ecs_task_api_role_arn" {
  value = aws_iam_role.this["ecs-task-api"].arn
}

output "ecs_task_agents_role_arn" {
  value = aws_iam_role.this["ecs-task-agents"].arn
}

output "lambda_agent_role_arn" {
  value = aws_iam_role.this["lambda-agent-exec"].arn
}

output "sfn_orchestrator_role_arn" {
  value = aws_iam_role.this["sfn-orchestrator"].arn
}

output "sagemaker_exec_role_arn" {
  value = aws_iam_role.this["sagemaker-exec"].arn
}

output "ecs_task_migrate_role_arn" {
  value = aws_iam_role.this["ecs-task-migrate"].arn
}

output "cognito_pre_token_role_arn" {
  value = aws_iam_role.this["cognito-pre-token"].arn
}

output "bedrock_logging_role_arn" {
  value = aws_iam_role.this["bedrock-logging"].arn
}
