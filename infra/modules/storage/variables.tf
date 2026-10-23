variable "project" {
  description = "Project slug, used as a name prefix on every resource."
  type        = string
}

variable "env" {
  description = "Environment name (dev | prod)."
  type        = string
}

variable "tags" {
  description = "Tags applied to every taggable resource in this module."
  type        = map(string)
  default     = {}
}

variable "kms_key_arn" {
  description = "The `assets` CMK. Encrypts every data bucket."
  type        = string
}

variable "cors_allowed_origins" {
  description = "Origins allowed to upload straight to S3 with a presigned URL: the app's domain, plus localhost for development."
  type        = list(string)
}

variable "access_log_retention_days" {
  description = "Days to keep S3, ALB, flow, CloudFront and Bedrock logs."
  type        = number
  default     = 90
}
