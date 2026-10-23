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
  description = "Encrypts the guardrail configuration (the `secrets` CMK)."
  type        = string
}

variable "logs_kms_key_arn" {
  type = string
}

variable "logging_role_arn" {
  description = "bedrock-logging role from the security module."
  type        = string
}

variable "log_bucket" {
  description = "Bucket for invocation payloads over 100 KB (access-logs)."
  type        = string
}

variable "model_tiers" {
  description = "ModelRouter tier → EU system inference profile it copies. Must be eu.* — global.* is denied everywhere."
  type        = map(string)
  default = {
    reasoning = "eu.anthropic.claude-opus-5-5"
    balanced  = "eu.anthropic.claude-sonnet-5"
    fast      = "eu.anthropic.claude-haiku-4-5-20251001-v1:0"
  }

  validation {
    condition     = alltrue([for p in values(var.model_tiers) : startswith(p, "eu.")])
    error_message = "Only eu.* inference profiles: Swiss scans are processed inside the EU only."
  }
}

variable "grounding_threshold" {
  description = "Contextual grounding and relevance threshold (0–0.99)."
  type        = number
  default     = 0.7
}

variable "log_retention_days" {
  type    = number
  default = 30
}
