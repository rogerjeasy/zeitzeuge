# Outputs consumed by the environment root module.
# Every cross-module reference goes through an explicit output — no remote-state
# lookups between modules inside the same environment.

output "falsifier_endpoint_name" {
  description = "Deterministic, so the state machine can reference it before it exists."
  value       = local.endpoint
}

output "endpoint_created" {
  value = var.falsifier_image_ready
}
