# Module: inference
#
# The Terrain Falsifier's model endpoint (PROPOSED_SOLUTION §6.1): one
# SageMaker Serverless endpoint serving both halves of the check —
# skyline segmentation (SAM2) and the swissALTI3D horizon raycaster — from the
# zeitzeuge/falsifier image, with artefacts under derivatives/models/.
#
# Serverless: no instance runs while nobody investigates; cold start is the
# price, which is why the state machine has a cached-horizon fallback and the
# pitch path warms the endpoint first.
#
# Created once the image exists (`falsifier_image_ready`). Until then the
# state machine's cached-horizon branch answers, and the demo is unchanged.

locals {
  name     = "${var.project}-${var.env}"
  endpoint = "${var.project}-${var.env}-falsifier"
}

resource "aws_sagemaker_model" "falsifier" {
  count = var.falsifier_image_ready ? 1 : 0

  name               = "${local.name}-falsifier-${substr(sha1(var.model_version), 0, 8)}"
  execution_role_arn = var.execution_role_arn

  primary_container {
    image          = "${var.falsifier_repository_url}:${var.model_version}"
    model_data_url = var.model_data_url
    environment = {
      ZZ_DEM_CACHE_BUCKET = var.dem_cache_bucket
      ZZ_REGION           = var.region
    }
  }

  tags = var.tags
}

resource "aws_sagemaker_endpoint_configuration" "falsifier" {
  count = var.falsifier_image_ready ? 1 : 0

  name_prefix = "${local.name}-falsifier-"
  kms_key_arn = null # serverless endpoints use AWS-owned storage encryption

  production_variants {
    variant_name = "primary"
    model_name   = aws_sagemaker_model.falsifier[0].name

    serverless_config {
      memory_size_in_mb = var.memory_mb
      max_concurrency   = var.max_concurrency
    }
  }

  tags = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_sagemaker_endpoint" "falsifier" {
  count = var.falsifier_image_ready ? 1 : 0

  name                 = local.endpoint
  endpoint_config_name = aws_sagemaker_endpoint_configuration.falsifier[0].name
  tags                 = var.tags
}
