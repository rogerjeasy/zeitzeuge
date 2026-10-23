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

variable "vpc_id" {
  type = string
}

variable "alb_arn" {
  type = string
}

variable "alb_dns_name" {
  type = string
}

variable "alb_sg_id" {
  type = string
}

variable "alb_listener_port" {
  type    = number
  default = 80
}

variable "log_bucket_arn" {
  description = "access-logs bucket ARN."
  type        = string
}

variable "price_class" {
  description = "PriceClass_100 = Europe + North America edges; the audience is in Rotkreuz."
  type        = string
  default     = "PriceClass_100"
}

variable "auth_rate_limit" {
  description = "Requests per IP per 5 min to /api/v1/auth/*."
  type        = number
  default     = 300
}

variable "global_rate_limit" {
  description = "Requests per IP per 5 min overall. High on purpose: an audience shares one venue IP."
  type        = number
  default     = 50000
}

variable "domain_name" {
  description = "Optional custom domain. Needs hosted_zone_id too; otherwise the *.cloudfront.net name is used."
  type        = string
  default     = null
}

variable "hosted_zone_id" {
  type    = string
  default = null
}
