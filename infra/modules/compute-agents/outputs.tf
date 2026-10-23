# Outputs consumed by the environment root module.
# Every cross-module reference goes through an explicit output — no remote-state
# lookups between modules inside the same environment.

output "function_arns" {
  description = "Agent key => deterministic function ARN (valid before the functions exist)."
  value       = local.function_arns
}

output "function_names" {
  value = local.function_names
}

output "deep_task_definition_family" {
  value = aws_ecs_task_definition.deep.family
}
