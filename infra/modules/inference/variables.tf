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

variable "falsifier_image_ready" {
  description = "Flip to true once zeitzeuge/falsifier:<model_version> is pushed."
  type        = bool
  default     = false
}

variable "falsifier_repository_url" {
  type = string
}

variable "model_version" {
  description = "Image tag to serve. A new value rolls a new model + config with no downtime."
  type        = string
  default     = "latest"
}

variable "model_data_url" {
  description = "s3://…/models/falsifier.tar.gz, or null when weights are baked into the image."
  type        = string
  default     = null
}

variable "execution_role_arn" {
  type = string
}

variable "dem_cache_bucket" {
  type = string
}

variable "region" {
  type = string
}

variable "memory_mb" {
  description = "Serverless memory (max 6144). SAM2 on CPU needs the top of the range."
  type        = number
  default     = 6144
}

variable "max_concurrency" {
  type    = number
  default = 4
}
