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

variable "alarm_email" {
  type = string
}

variable "limit_usd" {
  description = "The credit."
  type        = number
  default     = 2000
}

variable "bedrock_limit_usd" {
  description = "Monthly Bedrock budget within the credit."
  type        = number
  default     = 600
}

variable "billing_alarm_usd" {
  description = "Month-to-date estimated charges that trip the CloudWatch alarm."
  type        = number
  default     = 1500
}

variable "activate_cost_allocation_tags" {
  description = "Turn on after ~24 h of tagged usage; activation fails for keys not yet in billing data."
  type        = bool
  default     = false
}
