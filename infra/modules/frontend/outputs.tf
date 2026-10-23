# Outputs consumed by the environment root module.
# Every cross-module reference goes through an explicit output — no remote-state
# lookups between modules inside the same environment.

output "distribution_id" {
  value = aws_cloudfront_distribution.this.id
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.this.arn
}

output "domain_name" {
  description = "The public host name: the custom domain if set, else *.cloudfront.net."
  value       = local.custom_domain ? var.domain_name : aws_cloudfront_distribution.this.domain_name
}

output "app_url" {
  value = "https://${local.custom_domain ? var.domain_name : aws_cloudfront_distribution.this.domain_name}"
}

output "web_acl_name" {
  value = aws_wafv2_web_acl.this.name
}
