# `frontend`

The only public entry point.

```
viewer ─HTTPS/HTTP3─▶ CloudFront + WAF ─VPC Origin─▶ internal ALB
```

## Resources

- CloudFront distribution: one domain for the app, `/api/*` and WebSockets —
  no CORS for the browser. `/_next/static/*` cached for a year; everything else
  uncached. HSTS (preload), `X-Frame-Options: DENY`, `nosniff`, strict referrer.
- **VPC Origin** to the internal ALB, and the ALB's only ingress rule from
  outside: the security group CloudFront creates for that origin.
- **WAF** (us-east-1, CloudFront scope): AWS IP-reputation, common and
  known-bad-inputs rule sets, plus two rate limits:
  - `/api/v1/auth/*`: 300 requests / 5 min / IP — where credential stuffing aims
  - everything: 50 000 / 5 min / IP — **deliberately high**: an audience scanning
    the QR code shares one venue IP, and a page load is ~30 requests
- Access logs (CloudFront logging v2, Parquet) to the access-logs bucket
- Optional custom domain: ACM certificate in us-east-1 + Route 53 alias records,
  when `domain_name` and `hosted_zone_id` are both set

`PriceClass_100` (Europe + North America edges) — the audience is in Rotkreuz.
