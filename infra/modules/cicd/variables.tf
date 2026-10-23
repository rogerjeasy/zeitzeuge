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

variable "github_repo" {
  description = "owner/name allowed to deploy."
  type        = string
}

variable "github_oidc_provider_arn" {
  type = string
}

variable "allowed_ref" {
  type    = string
  default = "refs/heads/main"
}

variable "permissions_boundary_arn" {
  type = string
}

variable "policies_dir" {
  type    = string
  default = null
}
