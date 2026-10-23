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

variable "github_subject_prefix" {
  description = <<-EOT
    The OIDC `sub` prefix GitHub issues for the repository, before `:ref:…`.
    Repositories on GitHub's immutable subject format send
    `repo:<owner>@<owner_id>/<name>@<repo_id>` (see
    `gh api repos/<owner>/<name>/actions/oidc/customization/sub`); classic
    ones send `repo:<owner>/<name>`, which is the default here.
  EOT
  type        = string
  default     = null

  validation {
    condition     = var.github_subject_prefix == null || startswith(coalesce(var.github_subject_prefix, "x"), "repo:")
    error_message = "github_subject_prefix starts with \"repo:\"."
  }
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
