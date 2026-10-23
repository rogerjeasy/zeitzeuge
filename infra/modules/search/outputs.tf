# Outputs consumed by the environment root module.
# Every cross-module reference goes through an explicit output — no remote-state
# lookups between modules inside the same environment.

output "collection_endpoint" {
  description = "Null while the module is disabled."
  value       = one(aws_opensearchserverless_collection.this[*].collection_endpoint)
}

output "collection_arn" {
  value = one(aws_opensearchserverless_collection.this[*].arn)
}
