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

variable "agents_image_ready" {
  description = "Flip to true after CI has pushed zeitzeuge/agents:latest; creates the functions."
  type        = bool
  default     = false
}

variable "agents_repository_url" {
  type = string
}

variable "lambda_role_arn" {
  type = string
}

variable "ecs_task_role_arn" {
  description = "Task role for the deep agents."
  type        = string
}

variable "execution_role_arn" {
  type = string
}

variable "db_cluster_arn" {
  type = string
}

variable "db_app_secret_arn" {
  type = string
}

variable "db_name" {
  type = string
}

variable "bucket_names" {
  type = map(string)
}

variable "table_names" {
  type = map(string)
}

variable "guardrail_id" {
  type = string
}

variable "guardrail_version" {
  type = string
}

variable "inference_profile_arns" {
  description = "reasoning / balanced / fast application inference profiles."
  type        = map(string)
}

variable "external_keys_secret_arn" {
  type = string
}

variable "extra_env" {
  type    = map(string)
  default = {}
}

variable "reserved_concurrency" {
  description = "Per-function cap. Null until the Lambda concurrency quota is above 10."
  type        = number
  default     = null
}

variable "deep_cpu" {
  type    = number
  default = 2048
}

variable "deep_memory" {
  type    = number
  default = 4096
}

variable "warm_enabled" {
  description = "Enable the 5-minute warm-up during the event window only."
  type        = bool
  default     = false
}

variable "warm_agents" {
  description = "Agents the pitch path hits first."
  type        = list(string)
  default     = ["intake", "skyline", "verso", "grounding", "hypothesise", "cached-horizon"]
}

variable "logs_kms_key_arn" {
  type = string
}

variable "log_retention_days" {
  type    = number
  default = 30
}
