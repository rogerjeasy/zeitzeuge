# Outputs consumed by the environment root module.
# Every cross-module reference goes through an explicit output — no remote-state
# lookups between modules inside the same environment.

output "table_names" {
  description = "Table name by role: agent-memory, idempotency, tool-cache, run-locks, rate-limit."
  value       = { for k, v in aws_dynamodb_table.this : k => v.name }
}

output "table_arns" {
  value = { for k, v in aws_dynamodb_table.this : k => v.arn }
}
