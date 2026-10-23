# Outputs consumed by the environment root module.
# Every cross-module reference goes through an explicit output — no remote-state
# lookups between modules inside the same environment.

output "bucket_names" {
  description = "Bucket name by role: originals, derivatives, dem-cache, exports, assets, sfn-inventory."
  value       = { for k, v in aws_s3_bucket.data : k => v.bucket }
}

output "bucket_arns" {
  value = { for k, v in aws_s3_bucket.data : k => v.arn }
}

output "originals_bucket" {
  value = aws_s3_bucket.data["originals"].bucket
}

output "assets_bucket" {
  value = aws_s3_bucket.data["assets"].bucket
}

output "derivatives_bucket" {
  value = aws_s3_bucket.data["derivatives"].bucket
}

output "sfn_inventory_bucket" {
  value = aws_s3_bucket.data["sfn-inventory"].bucket
}

output "access_logs_bucket" {
  value = aws_s3_bucket.access_logs.bucket
}

output "access_logs_bucket_arn" {
  value = aws_s3_bucket.access_logs.arn
}
