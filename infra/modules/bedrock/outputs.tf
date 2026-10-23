# Outputs consumed by the environment root module.
# Every cross-module reference goes through an explicit output — no remote-state
# lookups between modules inside the same environment.

output "guardrail_id" {
  value = aws_bedrock_guardrail.this.guardrail_id
}

output "guardrail_version" {
  value = aws_bedrock_guardrail_version.this.version
}

output "inference_profile_arns" {
  description = "Application inference profile ARN per ModelRouter tier."
  value       = { for k, v in aws_bedrock_inference_profile.this : k => v.arn }
}
