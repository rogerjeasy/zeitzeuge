# Module: search
#
# OpenSearch Serverless: German BM25 + kNN hybrid ranking over descriptions.
#
# OFF by default (`enabled = false`). The smallest possible collection —
# 0.5 indexing + 0.5 search OCU, no standby — is USD 0.304/OCU-hour in Zurich,
# ~USD 222/month, the largest fixed cost in the stack. Aurora already carries
# vector recall (pgvector) and German full-text search (`to_tsvector('german',
# …)`), which covers the demo. Turn this on when the corpus outgrows Postgres
# ranking, not before.
#
# Access is IAM (SigV4) against a public endpoint, restricted by the data
# access policy to the API and agent roles. A VPC-only network policy would
# lock out the Lambda agents, which deliberately run outside the VPC.

data "aws_caller_identity" "current" {}

locals {
  name       = "${var.project}-${var.env}"
  collection = "${var.project}-${var.env}-records" # 3–32 chars, lowercase
}

resource "aws_opensearchserverless_security_policy" "encryption" {
  count = var.enabled ? 1 : 0

  name = "${local.name}-enc"
  type = "encryption"
  policy = jsonencode({
    Rules = [{
      ResourceType = "collection"
      Resource     = ["collection/${local.collection}"]
    }]
    AWSOwnedKey = false
    KmsARN      = var.kms_key_arn
  })
}

resource "aws_opensearchserverless_security_policy" "network" {
  count = var.enabled ? 1 : 0

  name = "${local.name}-net"
  type = "network"
  policy = jsonencode([{
    Rules = [
      { ResourceType = "collection", Resource = ["collection/${local.collection}"] },
    ]
    AllowFromPublic = true
  }])
}

resource "aws_opensearchserverless_access_policy" "data" {
  count = var.enabled ? 1 : 0

  name = "${local.name}-data"
  type = "data"
  policy = jsonencode([{
    Rules = [
      {
        ResourceType = "collection"
        Resource     = ["collection/${local.collection}"]
        Permission   = ["aoss:DescribeCollectionItems", "aoss:CreateCollectionItems", "aoss:UpdateCollectionItems"]
      },
      {
        ResourceType = "index"
        Resource     = ["index/${local.collection}/*"]
        Permission   = ["aoss:DescribeIndex", "aoss:CreateIndex", "aoss:UpdateIndex", "aoss:ReadDocument", "aoss:WriteDocument"]
      },
    ]
    Principal = var.access_role_arns
  }])
}

resource "aws_opensearchserverless_collection" "this" {
  count = var.enabled ? 1 : 0

  name             = local.collection
  description      = "German hybrid search over archive descriptions."
  type             = "VECTORSEARCH"
  standby_replicas = "DISABLED" # half the OCU floor; one-AZ index is fine at this scale

  tags = var.tags

  depends_on = [
    aws_opensearchserverless_security_policy.encryption,
    aws_opensearchserverless_security_policy.network,
  ]
}
