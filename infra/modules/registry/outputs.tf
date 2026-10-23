# Outputs consumed by the environment root module.
# Every cross-module reference goes through an explicit output — no remote-state
# lookups between modules inside the same environment.

output "repository_urls" {
  description = "Repository URL by service: api, web, agents, falsifier."
  value       = { for k, v in aws_ecr_repository.this : k => v.repository_url }
}
