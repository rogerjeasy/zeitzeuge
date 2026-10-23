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

variable "cidr_block" {
  description = "VPC CIDR. Must not overlap anything this VPC may ever peer with."
  type        = string
  default     = "10.20.0.0/16"
}

variable "availability_zones" {
  description = "AZs to spread across; the first two are used. Aurora needs two."
  type        = list(string)
  default     = ["eu-central-2a", "eu-central-2b"]

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least two AZs: Aurora refuses a single-AZ subnet group."
  }
}

variable "interface_endpoints" {
  description = <<-EOT
    Interface endpoint services to create. Each costs ~USD 19/month (2 AZs), so
    this list is the main network cost lever. The default keeps model traffic,
    image pulls, logs, secrets and the Step Functions callbacks off the NAT.
  EOT
  type        = list(string)
  default     = ["bedrock-runtime", "ecr.api", "ecr.dkr", "logs", "secretsmanager", "states"]
}

variable "alb_listener_port" {
  description = "Port the internal ALB listens on (CloudFront VPC Origin and SSR)."
  type        = number
  default     = 80
}

variable "web_port" {
  description = "Container port of the Next.js server."
  type        = number
  default     = 3000
}

variable "api_port" {
  description = "Container port of the FastAPI service."
  type        = number
  default     = 8000
}

variable "flow_logs_enabled" {
  description = "Deliver VPC flow logs (a plan-time switch; the bucket ARN is only known at apply)."
  type        = bool
  default     = false
}

variable "flow_logs_bucket_arn" {
  description = "S3 bucket ARN for VPC flow logs."
  type        = string
  default     = null
}
