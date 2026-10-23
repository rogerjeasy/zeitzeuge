# Region decision

**Home region: `eu-central-2` (Europe/Zurich).** Verify on day one — this is the
assumption most likely to be wrong, and everything downstream depends on it.

| Data | Region | Reason |
|---|---|---|
| Original scans, derivatives, Aurora, OpenSearch | `eu-central-2` | Swiss cantonal archive data stays in Switzerland. Treat as a hard requirement, not a preference. |
| All Claude models (Haiku 5.5, Sonnet 5.5, Opus 5.5) | `eu.*` cross-region inference profile, called from `eu-central-2` | preflight: every current Claude model in Zurich is `INFERENCE_PROFILE`-only, including Haiku. `eu.*` routes within 7 EU regions (Zurich included) |
| `global.*` inference profiles | **denied** in every policy | route worldwide. Fable 5 / 5.1 exist only as `global.*`, so they are out of the ModelRouter |
| ACM certificate for CloudFront | `us-east-1` | CloudFront only reads certificates from us-east-1, regardless of where anything else lives |
| Billing `EstimatedCharges` metric | `us-east-1` | the metric only exists there |

The last two are why `envs/*/versions.tf` declares an aliased `aws.us_east_1`
provider. It is not a data-residency compromise: a TLS certificate and a billing
metric carry no archive content.

## Verification

`make preflight` checks all of it: AZ listing, `bedrock list-foundation-models`,
Aurora Serverless v2 orderable options, OpenSearch Serverless reachability.

## Fallbacks, decided in advance

| If | Then |
|---|---|
| Bedrock lacks a frontier model in `eu-central-2` | EU cross-region inference profile; the ModelRouter makes it a `models.yaml` edit |
| Aurora Serverless v2 unavailable | `eu-central-1` (Frankfurt) for the database only — still EU, and say so plainly rather than quietly |
| OpenSearch Serverless unavailable | cut `modules/search`; pgvector in Aurora already covers vector recall, you lose German BM25 hybrid ranking |
| SageMaker Serverless unavailable | precomputed horizon profiles in S3; the falsifier reads cached ridgelines and the demo is unchanged |

Every row is a configuration change, not an architecture change. That property
is the point of the ModelRouter and of keeping the flow in Step Functions.
