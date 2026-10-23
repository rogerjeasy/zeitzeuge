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

variable "subnet_ids" {
  description = "Data-tier subnets (no internet route), in at least two AZs."
  type        = list(string)
}

variable "security_group_id" {
  description = "The db security group: 5432 from the API and agent tasks only."
  type        = string
}

variable "kms_key_arn" {
  description = "The `database` CMK: cluster storage and snapshots."
  type        = string
}

variable "secrets_kms_key_arn" {
  description = "The `secrets` CMK: the RDS-managed master secret."
  type        = string
}

variable "logs_kms_key_arn" {
  description = "The `logs` CMK: the exported PostgreSQL log group."
  type        = string
}

variable "app_secret_arn" {
  description = "The db/app secret container from the security module."
  type        = string
}

variable "engine_version" {
  description = "Aurora PostgreSQL version. 16.x matches the pgvector/pg16 image the CI RLS suite runs against."
  type        = string
  default     = "16.14"
}

variable "database_name" {
  type    = string
  default = "zeitzeuge"
}

variable "min_capacity" {
  description = "Minimum ACUs. 0 pauses when idle (cheapest); set 0.5 for the event so nothing waits on a resume."
  type        = number
  default     = 0
}

variable "max_capacity" {
  description = "Maximum ACUs — the cost ceiling of the database."
  type        = number
  default     = 4
}

variable "seconds_until_auto_pause" {
  description = "Idle seconds before pausing, when min_capacity is 0."
  type        = number
  default     = 1800
}

variable "backup_retention_days" {
  type    = number
  default = 7
}

variable "deletion_protection" {
  description = "Must be switched off (and applied) before a teardown can delete the cluster."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  type    = number
  default = 30
}
