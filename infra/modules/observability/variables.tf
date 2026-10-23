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

variable "account_id" {
  type = string
}

variable "alarm_email" {
  description = "Receives every alarm and failed investigation. Confirm the subscription mail."
  type        = string
}

variable "kms_key_arn" {
  description = "The `logs` CMK; its key policy lets CloudWatch and EventBridge publish."
  type        = string
}

variable "alb_arn_suffix" {
  type = string
}

variable "target_group_arn_suffixes" {
  type = map(string)
}

variable "state_machine_arns" {
  description = "[investigation, bulk]."
  type        = list(string)
}

variable "db_cluster_id" {
  type = string
}

variable "db_max_capacity" {
  type = number
}

variable "falsifier_endpoint_enabled" {
  type    = bool
  default = false
}

variable "falsifier_endpoint_name" {
  type    = string
  default = ""
}
