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

variable "pre_token_role_arn" {
  description = "Execution role for the pre-token hook (security module)."
  type        = string
}

variable "secrets_kms_key_arn" {
  type = string
}

variable "logs_kms_key_arn" {
  type = string
}

variable "guest_username" {
  description = "The demo identity; must match ZZ_GUEST_USERNAME in the API."
  type        = string
  default     = "demo@zeitzeuge.ch"
}

variable "session_idle_days" {
  description = "Refresh-token lifetime; matches session_idle_days in the API settings."
  type        = number
  default     = 30
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "secret_recovery_window_days" {
  type    = number
  default = 7
}

variable "deletion_protection" {
  type    = bool
  default = true
}
