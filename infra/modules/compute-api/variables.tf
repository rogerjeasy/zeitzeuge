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

# --- network ----------------------------------------------------------------

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "alb_sg_id" {
  type = string
}

variable "api_sg_id" {
  type = string
}

variable "web_sg_id" {
  type = string
}

variable "alb_listener_port" {
  type    = number
  default = 80
}

variable "api_port" {
  type    = number
  default = 8000
}

variable "web_port" {
  type    = number
  default = 3000
}

# --- identity ---------------------------------------------------------------

variable "execution_role_arn" {
  type = string
}

variable "api_task_role_arn" {
  type = string
}

variable "migrate_task_role_arn" {
  type = string
}

# --- images -----------------------------------------------------------------

variable "api_repository_url" {
  type = string
}

variable "web_repository_url" {
  type = string
}

variable "api_image_ready" {
  description = "Flip to true after CI has pushed zeitzeuge/api:latest. Until then the service runs 0 tasks."
  type        = bool
  default     = false
}

variable "web_image_ready" {
  description = "Flip to true after CI has pushed zeitzeuge/web:latest."
  type        = bool
  default     = false
}

# --- sizing: the cost and the capacity for the audience ----------------------

variable "api_cpu" {
  type    = number
  default = 1024
}

variable "api_memory" {
  type    = number
  default = 2048
}

variable "web_cpu" {
  type    = number
  default = 512
}

variable "web_memory" {
  type    = number
  default = 1024
}

variable "api_min_tasks" {
  description = "1 while building; 2 for the event (one per AZ)."
  type        = number
  default     = 1
}

variable "api_max_tasks" {
  type    = number
  default = 6
}

variable "web_min_tasks" {
  type    = number
  default = 1
}

variable "web_max_tasks" {
  type    = number
  default = 6
}

variable "requests_per_task_target" {
  description = "ALB requests per task per minute before scaling out."
  type        = number
  default     = 600
}

# --- application wiring -------------------------------------------------------

variable "public_origins" {
  description = "Browser origins the API accepts (the CloudFront domain, localhost)."
  type        = list(string)
}

variable "cdn_domain" {
  description = "The CloudFront domain the API builds public links with."
  type        = string
}

variable "cognito_user_pool_id" {
  type = string
}

variable "cognito_client_id" {
  type = string
}

variable "cognito_client_secret_arn" {
  type = string
}

variable "guest_username" {
  type = string
}

variable "guest_secret_arn" {
  type = string
}

variable "db_app_secret_arn" {
  type = string
}

variable "db_master_secret_arn" {
  type = string
}

variable "db_host" {
  type = string
}

variable "db_name" {
  type = string
}

variable "assets_bucket" {
  type = string
}

variable "assets_kms_key_arn" {
  type = string
}

variable "rate_limit_table" {
  type = string
}

variable "api_extra_env" {
  description = "Additional ZZ_* settings for the API (state machine ARN, table names, …)."
  type        = map(string)
  default     = {}
}

# --- operations ---------------------------------------------------------------

variable "logs_kms_key_arn" {
  type = string
}

variable "log_bucket" {
  description = "ALB access logs destination (access-logs bucket)."
  type        = string
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "deletion_protection" {
  description = "ALB deletion protection."
  type        = bool
  default     = true
}
