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

variable "enabled" {
  description = "Create the collection. ~USD 222/month minimum in Zurich — see main.tf."
  type        = bool
  default     = false
}

variable "kms_key_arn" {
  description = "The `search` CMK."
  type        = string
}

variable "access_role_arns" {
  description = "Roles allowed to read and write the collection (API task, agents)."
  type        = list(string)
}
