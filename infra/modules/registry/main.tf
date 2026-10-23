# Module: registry
#
# ECR repositories, one per deployable image. Names are `zeitzeuge/<service>`
# (one environment, so no env segment), which is what the CI workflows push to
# and what every pull policy is scoped to (`repository/zeitzeuge/*`).
#
#   api        FastAPI (linux/amd64)
#   web        Next.js standalone server
#   agents     every agent: Lambda image + the deep-agent Fargate task
#   falsifier  SageMaker Serverless: skyline segmentation + DEM raycaster

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  repositories = toset(["api", "web", "agents", "falsifier"])
}

resource "aws_ecr_repository" "this" {
  for_each = local.repositories

  name = "${var.project}/${each.key}"

  # A deployed tag can never be overwritten — except `latest`, which CI moves
  # on every push and the ECS services track.
  image_tag_mutability = "IMMUTABLE_WITH_EXCLUSION"
  image_tag_mutability_exclusion_filter {
    filter      = "latest"
    filter_type = "WILDCARD"
  }

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = merge(var.tags, { Name = "${var.project}/${each.key}" })
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each = local.repositories

  repository = aws_ecr_repository.this[each.key].name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Untagged layers from superseded pushes"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep the last ${var.keep_images} images for rollback"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.keep_images
        }
        action = { type = "expire" }
      },
    ]
  })
}

# Lambda pulls container images with its own service principal, not the
# function's role, so the agents repository must allow it — for this
# account's agent functions only.
data "aws_iam_policy_document" "agents_lambda_pull" {
  statement {
    sid     = "LambdaPullForOwnAgentFunctions"
    actions = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "aws:sourceArn"
      values   = ["arn:aws:lambda:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:function:${var.project}-${var.env}-agent-*"]
    }
  }
}

resource "aws_ecr_repository_policy" "agents" {
  repository = aws_ecr_repository.this["agents"].name
  policy     = data.aws_iam_policy_document.agents_lambda_pull.json
}
