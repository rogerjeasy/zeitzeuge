# Module: frontend
#
# The only public entry point.
#
#   viewer ──HTTPS/HTTP3──▶ CloudFront + WAF ──VPC Origin──▶ internal ALB
#
# One domain for the app, the API (/api/*) and WebSockets: no CORS for the
# browser, one TLS certificate, one WAF. The ALB has no public address — the
# VPC Origin reaches it over AWS's network, and the ALB's security group admits
# only the security group CloudFront creates for that origin.
#
# Caching: /_next/static/* is content-hashed and cached for a year; everything
# else (SSR pages, the API, WebSockets) passes through uncached.

locals {
  name = "${var.project}-${var.env}"

  custom_domain = var.domain_name != null && var.hosted_zone_id != null
}

# ---------------------------------------------------------------------------
# VPC Origin and the ALB's only public-facing ingress rule
# ---------------------------------------------------------------------------

resource "aws_cloudfront_vpc_origin" "alb" {
  vpc_origin_endpoint_config {
    name                   = "${local.name}-alb"
    arn                    = var.alb_arn
    http_port              = var.alb_listener_port
    https_port             = 443
    origin_protocol_policy = "http-only" # private AWS network; TLS ends at CloudFront

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }

  tags = var.tags
}

# CloudFront creates this group in the VPC when the VPC Origin deploys; it is
# the source identity of every request the ALB may accept from outside.
data "aws_security_group" "cloudfront_vpc_origin" {
  vpc_id = var.vpc_id
  name   = "CloudFront-VPCOrigins-Service-SG"

  depends_on = [aws_cloudfront_vpc_origin.alb]
}

resource "aws_vpc_security_group_ingress_rule" "alb_from_cloudfront" {
  security_group_id            = var.alb_sg_id
  referenced_security_group_id = data.aws_security_group.cloudfront_vpc_origin.id
  ip_protocol                  = "tcp"
  from_port                    = var.alb_listener_port
  to_port                      = var.alb_listener_port
  description                  = "from CloudFront VPC Origin"
}

# ---------------------------------------------------------------------------
# WAF (CloudFront scope lives in us-east-1)
# ---------------------------------------------------------------------------

resource "aws_wafv2_web_acl" "this" {
  provider = aws.us_east_1

  name        = local.name
  description = "ZEITZEUGE edge: AWS managed rules + rate limits sized for a shared venue IP."
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Sign-in, sign-up and reset: tight, because that is where credential
  # stuffing aims. Cognito's own lockout sits behind it. Counts every POST
  # whose path contains /auth/ — the API's /api/v1/auth/* *and* the web app's
  # /<locale>/auth/* pages, whose Server Actions sign people in. Page loads
  # (GET) are not counted, so a room sharing one venue IP can still open them.
  rule {
    name     = "rate-limit-auth"
    priority = 0

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit                 = var.auth_rate_limit
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"

        scope_down_statement {
          and_statement {
            statement {
              byte_match_statement {
                search_string         = "post"
                positional_constraint = "EXACTLY"
                field_to_match {
                  method {}
                }
                text_transformation {
                  priority = 0
                  type     = "LOWERCASE"
                }
              }
            }
            statement {
              byte_match_statement {
                search_string         = "/auth/"
                positional_constraint = "CONTAINS"
                field_to_match {
                  uri_path {}
                }
                text_transformation {
                  priority = 0
                  type     = "LOWERCASE"
                }
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-rate-auth"
      sampled_requests_enabled   = true
    }
  }

  # Everything else: generous. A lecture hall of phones behind one NAT is
  # one IP; a page load is ~30 requests. This stops a flood, not an audience.
  rule {
    name     = "rate-limit-global"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit                 = var.global_rate_limit
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-rate-global"
      sampled_requests_enabled   = true
    }
  }

  dynamic "rule" {
    for_each = {
      AWSManagedRulesAmazonIpReputationList = 10
      AWSManagedRulesCommonRuleSet          = 11
      AWSManagedRulesKnownBadInputsRuleSet  = 12
    }
    content {
      name     = rule.key
      priority = rule.value

      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = rule.key
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name}-${rule.key}"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = local.name
    sampled_requests_enabled   = true
  }

  tags = var.tags
}

# ---------------------------------------------------------------------------
# Optional custom domain (certificate must be in us-east-1 for CloudFront)
# ---------------------------------------------------------------------------

resource "aws_acm_certificate" "this" {
  count    = local.custom_domain ? 1 : 0
  provider = aws.us_east_1

  domain_name       = var.domain_name
  validation_method = "DNS"
  tags              = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "validation" {
  for_each = local.custom_domain ? {
    for o in aws_acm_certificate.this[0].domain_validation_options : o.domain_name => o
  } : {}

  zone_id = var.hosted_zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  records = [each.value.resource_record_value]
  ttl     = 300
}

resource "aws_acm_certificate_validation" "this" {
  count    = local.custom_domain ? 1 : 0
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.this[0].arn
  validation_record_fqdns = [for r in aws_route53_record.validation : r.fqdn]
}

# ---------------------------------------------------------------------------
# Distribution
# ---------------------------------------------------------------------------

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

# Every viewer header including Host, plus CloudFront's own headers.
#
# Host: Next.js rejects any Server Action whose Origin does not match the Host
# it receives; with the ALB's hostname in its place, every sign-in and sign-up
# fails with a 500. `.github/scripts/smoke.sh web` checks this after deploys.
#
# CloudFront-Viewer-Address: the client's address as CloudFront saw the TCP
# connection — the only one a client cannot forge (X-Forwarded-For can be
# prepended to). The API's rate limits and audit trail key on it, and the
# CloudFront-Viewer-City/Country pair labels sessions in /settings/security.
data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewerAndCloudFrontHeaders-2022-06"
}

resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "${local.name}-security"
  comment = "HSTS, no framing, no sniffing, strict referrer."

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    content_type_options {
      override = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }
}

resource "aws_cloudfront_distribution" "this" {
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = var.price_class
  comment         = "${local.name}: app, API and run streams on one origin"
  web_acl_id      = aws_wafv2_web_acl.this.arn
  aliases         = local.custom_domain ? [var.domain_name] : []

  origin {
    origin_id   = "alb"
    domain_name = var.alb_dns_name

    vpc_origin_config {
      vpc_origin_id            = aws_cloudfront_vpc_origin.alb.id
      origin_keepalive_timeout = 60
      origin_read_timeout      = 60
    }
  }

  # SSR pages: never cached, every viewer header forwarded.
  default_cache_behavior {
    target_origin_id           = "alb"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  # API and WebSocket run streams.
  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = "alb"
    viewer_protocol_policy     = "https-only"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  # Content-hashed build assets: cache for a year at the edge.
  ordered_cache_behavior {
    path_pattern               = "/_next/static/*"
    target_origin_id           = "alb"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = !local.custom_domain
    acm_certificate_arn            = local.custom_domain ? aws_acm_certificate_validation.this[0].certificate_arn : null
    ssl_support_method             = local.custom_domain ? "sni-only" : null
    minimum_protocol_version       = local.custom_domain ? "TLSv1.2_2021" : null
  }

  tags = merge(var.tags, { Name = local.name })
}

resource "aws_route53_record" "app" {
  for_each = local.custom_domain ? toset(["A", "AAAA"]) : toset([])

  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = each.key

  alias {
    name                   = aws_cloudfront_distribution.this.domain_name
    zone_id                = aws_cloudfront_distribution.this.hosted_zone_id
    evaluate_target_health = false
  }
}

# ---------------------------------------------------------------------------
# Access logs (CloudFront standard logging v2 → the access-logs bucket)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_delivery_source" "cloudfront" {
  provider = aws.us_east_1

  name         = "${local.name}-cloudfront"
  log_type     = "ACCESS_LOGS"
  resource_arn = aws_cloudfront_distribution.this.arn
}

resource "aws_cloudwatch_log_delivery_destination" "s3" {
  provider = aws.us_east_1

  name          = "${local.name}-cloudfront-s3"
  output_format = "parquet"

  delivery_destination_configuration {
    destination_resource_arn = "${var.log_bucket_arn}/cloudfront"
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_delivery" "cloudfront" {
  provider = aws.us_east_1

  delivery_source_name     = aws_cloudwatch_log_delivery_source.cloudfront.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.s3.arn

  s3_delivery_configuration {
    suffix_path = "/{yyyy}/{MM}/{dd}"
  }

  tags = var.tags
}
