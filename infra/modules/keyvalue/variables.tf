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
  description = "The `database` CMK."
  type        = string
}

variable "deletion_protection" {
  type    = bool
  default = true
}
