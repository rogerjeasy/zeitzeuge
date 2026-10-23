# Module: storage
#
# Every S3 bucket. Seven of them, each with one job:
#
#   originals      the archive's scans. Versioned, Object Lock enabled,
#                  access-logged, inventoried. Write-once by policy: the
#                  boundary denies every role delete here.
#   derivatives    IIIF tiles, thumbnails, model artefacts (models/)
#   dem-cache      swissALTI3D tiles for the Terrain Falsifier
#   exports        ISAD(G) / EAD / DC / XMP output, short-lived
#   assets         user assets the API owns (avatars/)
#   sfn-inventory  S3 Inventory manifests + Distributed Map results
#   access-logs    S3 access logs, ALB logs, VPC flow logs, CloudFront logs,
#                  Bedrock large-payload logs
#
# Baseline on every bucket: public access blocked, BucketOwnerEnforced (no
# ACLs), TLS-only bucket policy, encryption at rest. Data buckets use the
# `assets` CMK with S3 Bucket Keys (one KMS call per object batch, not per
# object); access-logs uses SSE-S3 because S3 server access logging and ELB
# log delivery cannot write to a CMK-encrypted bucket.

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  name       = "${var.project}-${var.env}"
  region     = data.aws_region.current.region
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition

  data_buckets = {
    originals     = { versioned = true, object_lock = true }
    derivatives   = { versioned = false, object_lock = false }
    dem-cache     = { versioned = false, object_lock = false }
    exports       = { versioned = false, object_lock = false }
    assets        = { versioned = true, object_lock = false }
    sfn-inventory = { versioned = false, object_lock = false }
  }

  all_buckets = merge(
    { for k, v in local.data_buckets : k => aws_s3_bucket.data[k] },
    { access-logs = aws_s3_bucket.access_logs },
  )
}

# ---------------------------------------------------------------------------
# Buckets
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "data" {
  for_each = local.data_buckets

  bucket              = "${local.name}-${each.key}"
  object_lock_enabled = each.value.object_lock

  # Emptying a bucket is a decision, not a side effect of `terraform destroy`.
  force_destroy = false

  tags = merge(var.tags, { Name = "${local.name}-${each.key}" })
}

resource "aws_s3_bucket" "access_logs" {
  bucket        = "${local.name}-access-logs"
  force_destroy = false
  tags          = merge(var.tags, { Name = "${local.name}-access-logs" })
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each = local.all_buckets

  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "this" {
  for_each = local.all_buckets

  bucket = each.value.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  for_each = local.data_buckets

  bucket = aws_s3_bucket.data[each.key].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "this" {
  for_each = { for k, v in local.data_buckets : k => v if v.versioned }

  bucket = aws_s3_bucket.data[each.key].id
  versioning_configuration {
    status = "Enabled"
  }
}

# Object Lock is enabled but no default retention is set: the archive decides
# retention per record once it owns the system. Governance mode can then be
# applied per object without a bucket rebuild — that is what "object-lock
# ready" means, and it cannot be retrofitted onto an existing bucket.

# ---------------------------------------------------------------------------
# Lifecycle — every bucket that can grow without bound has an end
# ---------------------------------------------------------------------------

resource "aws_s3_bucket_lifecycle_configuration" "derivatives" {
  bucket = aws_s3_bucket.data["derivatives"].id

  rule {
    id     = "tiles-to-infrequent-access"
    status = "Enabled"
    filter {}
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "short_lived" {
  for_each = { dem-cache = 90, exports = 7, sfn-inventory = 30 }

  bucket = aws_s3_bucket.data[each.key].id

  rule {
    id     = "expire-after-${each.value}-days"
    status = "Enabled"
    filter {}
    expiration {
      days = each.value
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "originals" {
  bucket = aws_s3_bucket.data["originals"].id

  # Current versions are the archive and are never expired. Only abandoned
  # multipart uploads (a browser tab closed mid-upload) are cleaned up.
  rule {
    id     = "abort-abandoned-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  depends_on = [aws_s3_bucket_versioning.this]
}

resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.data["assets"].id

  rule {
    id     = "drop-replaced-avatars"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  depends_on = [aws_s3_bucket_versioning.this]
}

resource "aws_s3_bucket_lifecycle_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    id     = "expire-logs"
    status = "Enabled"
    filter {}
    expiration {
      days = var.access_log_retention_days
    }
  }
}

# ---------------------------------------------------------------------------
# Browser uploads — presigned PUT/POST straight to S3, never through Fargate
# ---------------------------------------------------------------------------

resource "aws_s3_bucket_cors_configuration" "uploads" {
  for_each = toset(["originals", "assets"])

  bucket = aws_s3_bucket.data[each.key].id

  cors_rule {
    allowed_methods = ["PUT", "POST", "GET", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag", "x-amz-version-id"]
    max_age_seconds = 3000
  }
}

# ---------------------------------------------------------------------------
# The archive is observable: who touched which scan, and what is in it
# ---------------------------------------------------------------------------

resource "aws_s3_bucket_logging" "originals" {
  bucket        = aws_s3_bucket.data["originals"].id
  target_bucket = aws_s3_bucket.access_logs.id
  target_prefix = "s3/originals/"

  target_object_key_format {
    partitioned_prefix {
      partition_date_source = "EventTime"
    }
  }
}

# Daily manifest of the archive — the input the bulk state machine's
# Distributed Map reads. This is the backlog run, driven by S3 itself.
resource "aws_s3_bucket_inventory" "originals" {
  bucket                   = aws_s3_bucket.data["originals"].id
  name                     = "bulk-manifest"
  included_object_versions = "Current"

  schedule {
    frequency = "Daily"
  }

  optional_fields = ["Size", "LastModifiedDate", "ETag"]

  destination {
    bucket {
      bucket_arn = aws_s3_bucket.data["sfn-inventory"].arn
      format     = "CSV"
      prefix     = "inventory"
      encryption {
        sse_kms {
          key_id = var.kms_key_arn
        }
      }
    }
  }
}

# Object-created events on the archive go to EventBridge, so an upload can
# start an investigation without the API polling for it.
resource "aws_s3_bucket_notification" "originals" {
  bucket      = aws_s3_bucket.data["originals"].id
  eventbridge = true
}

# ---------------------------------------------------------------------------
# Bucket policies
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "tls_only" {
  for_each = local.all_buckets

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [each.value.arn, "${each.value.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

# S3 Inventory writes the daily manifest into sfn-inventory.
data "aws_iam_policy_document" "sfn_inventory" {
  source_policy_documents = [data.aws_iam_policy_document.tls_only["sfn-inventory"].json]

  statement {
    sid       = "S3InventoryDelivery"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.data["sfn-inventory"].arn}/inventory/*"]

    principals {
      type        = "Service"
      identifiers = ["s3.amazonaws.com"]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = [aws_s3_bucket.data["originals"].arn]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

# Every AWS log producer that writes here, each pinned to this account.
data "aws_iam_policy_document" "access_logs" {
  source_policy_documents = [data.aws_iam_policy_document.tls_only["access-logs"].json]

  statement {
    sid       = "S3ServerAccessLogs"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.access_logs.arn}/s3/*"]

    principals {
      type        = "Service"
      identifiers = ["logging.s3.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }

  # Regions launched after 2022 (Zurich among them) take ALB logs from this
  # service principal, not from a per-region ELB account id.
  statement {
    sid       = "AlbAccessLogs"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.access_logs.arn}/alb/AWSLogs/${local.account_id}/*"]

    principals {
      type        = "Service"
      identifiers = ["logdelivery.elasticloadbalancing.amazonaws.com"]
    }
  }

  # VPC flow logs and CloudFront (v2) logs both arrive through log delivery.
  statement {
    sid       = "LogDeliveryWrite"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.access_logs.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }

  statement {
    sid       = "LogDeliveryAclCheck"
    actions   = ["s3:GetBucketAcl", "s3:ListBucket"]
    resources = [aws_s3_bucket.access_logs.arn]

    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }

  # Bedrock writes invocation payloads too large for CloudWatch here.
  statement {
    sid       = "BedrockLargePayloads"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.access_logs.arn}/bedrock/*"]

    principals {
      type        = "Service"
      identifiers = ["bedrock.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:${local.partition}:bedrock:${local.region}:${local.account_id}:*"]
    }
  }
}

resource "aws_s3_bucket_policy" "data" {
  for_each = { for k, v in local.data_buckets : k => v if k != "sfn-inventory" }

  bucket = aws_s3_bucket.data[each.key].id
  policy = data.aws_iam_policy_document.tls_only[each.key].json

  depends_on = [aws_s3_bucket_public_access_block.this]
}

resource "aws_s3_bucket_policy" "sfn_inventory" {
  bucket = aws_s3_bucket.data["sfn-inventory"].id
  policy = data.aws_iam_policy_document.sfn_inventory.json

  depends_on = [aws_s3_bucket_public_access_block.this]
}

resource "aws_s3_bucket_policy" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id
  policy = data.aws_iam_policy_document.access_logs.json

  depends_on = [aws_s3_bucket_public_access_block.this]
}
