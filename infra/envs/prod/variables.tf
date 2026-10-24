variable "project" {
  description = "Project slug, used as a name prefix on every resource."
  type        = string
  default     = "zeitzeuge"
}

variable "env" {
  description = "Environment name."
  type        = string
  default     = "prod"
}

variable "region" {
  description = "Home region. Swiss scans stay in Zurich (PROPOSED_SOLUTION 10.3)."
  type        = string
  default     = "eu-central-2"
}

variable "github_repo" {
  description = "Repository allowed to assume the deploy role, as owner/name."
  type        = string
}

variable "github_subject_prefix" {
  description = "OIDC subject prefix GitHub issues for github_repo (immutable format: repo:<owner>@<id>/<name>@<id>). null = classic repo:<owner>/<name>."
  type        = string
  default     = null
}

variable "github_oidc_provider_arn" {
  description = "From `terraform output github_oidc_provider_arn` in infra/bootstrap."
  type        = string
}

variable "budget_limit_usd" {
  description = "Hard ceiling for the account. The hackathon credit is USD 2000."
  type        = number
  default     = 2000
}

variable "alarm_email" {
  description = "Address subscribed to the cost and failure SNS topics."
  type        = string
}

# --- Switches that follow the build ------------------------------------------
# Each flips to true once CI has pushed the image; `terraform apply` then
# creates or scales the thing that runs it.

variable "api_image_ready" {
  type    = bool
  default = false
}

variable "web_image_ready" {
  type    = bool
  default = false
}

variable "agents_image_ready" {
  type    = bool
  default = false
}

variable "falsifier_image_ready" {
  type    = bool
  default = false
}

# --- Cost and capacity knobs -------------------------------------------------

variable "interface_endpoints" {
  description = "Interface VPC endpoints (~USD 19/month each). [] until the week before the event."
  type        = list(string)
  default     = ["bedrock-runtime", "ecr.api", "ecr.dkr", "logs", "secretsmanager", "states"]
}

variable "search_enabled" {
  description = "OpenSearch Serverless, ~USD 222/month minimum. Aurora covers search until this is on."
  type        = bool
  default     = false
}

variable "db_min_capacity" {
  description = "0 = pause when idle. 0.5 for the event."
  type        = number
  default     = 0
}

variable "db_max_capacity" {
  type    = number
  default = 4
}

variable "api_min_tasks" {
  description = "1 while building, 2 for the event."
  type        = number
  default     = 1
}

variable "web_min_tasks" {
  type    = number
  default = 1
}

variable "agent_reserved_concurrency" {
  description = "Per-agent Lambda cap. 17 x this must stay <= 900 (account limit 1000, AWS keeps 100 unreserved)."
  type        = number
  default     = null

  validation {
    condition     = var.agent_reserved_concurrency == null || 17 * coalesce(var.agent_reserved_concurrency, 0) <= 900
    error_message = "17 agents x the cap must leave at least 100 of the 1000 concurrency unreserved."
  }
}

variable "warm_agents" {
  description = "Keep pitch-path agents warm (event window only)."
  type        = bool
  default     = false
}

variable "activate_cost_allocation_tags" {
  type    = bool
  default = false
}

# --- Edge -------------------------------------------------------------------

variable "domain_name" {
  description = "Optional custom domain; *.cloudfront.net otherwise."
  type        = string
  default     = null
}

variable "hosted_zone_id" {
  type    = string
  default = null
}

variable "extra_cors_origins" {
  description = "Browser origins besides the public edge (local development)."
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "deletion_protection" {
  description = "Aurora, the ALB, Cognito and agent-memory. Set false and apply ONLY as step 1 of a teardown."
  type        = bool
  default     = true
}

variable "stasz_members" {
  description = "Comma-separated e-mail addresses attached to the Staatsarchiv tenant by the seed (design note D9). Set in the git-ignored terraform.tfvars."
  type        = string
  default     = ""
}
