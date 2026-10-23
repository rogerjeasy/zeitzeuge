# `storage`

Every S3 bucket, each with one job.

| Bucket | Holds | Encryption | Retention |
|---|---|---|---|
| `originals` | the archive's scans | assets CMK | forever; versioned, Object Lock enabled, access-logged, daily inventory, EventBridge on upload |
| `derivatives` | IIIF tiles, thumbnails, `models/` | assets CMK | to Standard-IA after 30 days |
| `dem-cache` | swissALTI3D tiles | assets CMK | 90 days |
| `exports` | ISAD(G) / EAD / DC / XMP | assets CMK | 7 days |
| `assets` | user assets the API owns (`avatars/`) | assets CMK | replaced versions after 7 days |
| `sfn-inventory` | inventory manifests, bulk results | assets CMK | 30 days |
| `access-logs` | S3, ALB, VPC flow, CloudFront, Bedrock logs | SSE-S3 | 90 days |

## Baseline on every bucket

Public access blocked · no ACLs (`BucketOwnerEnforced`) · TLS-only bucket
policy · encryption at rest · `force_destroy = false`.

## Why these choices

- **The archive is write-once by policy, not by convention.** `ZeitzeugeBoundary`
  denies every runtime role `DeleteObject`, retention changes and versioning
  changes on `originals`. Object Lock is enabled so governance retention can be
  applied per record later — it cannot be added to an existing bucket.
- **Uploads never pass through Fargate.** The browser PUTs/POSTs to `originals`
  and `assets` with a presigned URL; the CORS rule is what makes that work.
- **access-logs uses SSE-S3** because S3 server access logging and ALB log
  delivery cannot write into a CMK-encrypted bucket.
- **S3 Bucket Keys** on every CMK bucket cut KMS request cost by orders of
  magnitude for tile-heavy workloads.
