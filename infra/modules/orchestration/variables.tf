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

variable "role_arn" {
  description = "sfn-orchestrator role from the security module."
  type        = string
}

variable "agent_function_arns" {
  description = "Agent key => Lambda ARN (compute-agents)."
  type        = map(string)
}

variable "falsifier_endpoint_name" {
  type = string
}

variable "inventory_bucket" {
  type = string
}

variable "kms_key_arn" {
  description = "Encrypts execution history (the `assets` CMK)."
  type        = string
}

variable "logs_kms_key_arn" {
  type = string
}

variable "asl_dir" {
  type    = string
  default = null
}

variable "log_retention_days" {
  type    = number
  default = 90 # this is the audit trail; keep it longer than application logs
}
