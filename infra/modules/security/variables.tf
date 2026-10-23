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

variable "permissions_boundary_arn" {
  description = "ARN of ZeitzeugeBoundary. Set on every role; the builder cannot create a role without it."
  type        = string

  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:policy/ZeitzeugeBoundary$", var.permissions_boundary_arn))
    error_message = "Must be the ZeitzeugeBoundary policy ARN."
  }
}

variable "policies_dir" {
  description = "Directory holding the IAM policy JSON templates."
  type        = string
  default     = null
}

variable "kms_deletion_window_days" {
  description = "Waiting period before a scheduled key deletion takes effect. 30 is the maximum and the safe default for keys that encrypt the archive."
  type        = number
  default     = 30
}

variable "secret_recovery_window_days" {
  description = "Days a deleted secret stays recoverable. 7 lets a teardown and re-create reuse the same names within the week."
  type        = number
  default     = 7
}

variable "cognito_user_pool_arn" {
  description = "The API's Cognito pool; its role may call the Cognito admin APIs on this pool only."
  type        = string
  default     = null
}
