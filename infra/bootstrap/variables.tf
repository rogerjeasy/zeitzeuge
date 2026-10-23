variable "project" {
  description = "Project slug, used as a name prefix."
  type        = string
  default     = "zeitzeuge"
}

variable "region" {
  description = "Home region. Swiss scans stay in Zurich (see PROPOSED_SOLUTION 10.3)."
  type        = string
  default     = "eu-central-2"
}

variable "github_repo" {
  description = "GitHub repository allowed to assume the deploy roles, as owner/name."
  type        = string
}

variable "state_bucket_name" {
  description = "Globally unique name for the Terraform state bucket."
  type        = string
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub OIDC provider. False here: the account already has one, and AWS allows one per issuer URL."
  type        = bool
  default     = false
}
