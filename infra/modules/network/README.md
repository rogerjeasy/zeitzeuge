# `network`

Private network foundation. Everything with an ENI lives here; nothing else
creates subnets or security groups.

## Shape

| Tier | CIDRs (2 AZs) | Route to internet | Holds |
|---|---|---|---|
| public | `10.20.0.0/24`, `10.20.1.0/24` | IGW | the NAT gateway, nothing else |
| private | `10.20.16.0/20`, `10.20.32.0/20` | NAT | internal ALB, Fargate tasks (web, API, agents), interface endpoints |
| data | `10.20.64.0/24`, `10.20.65.0/24` | **none** | Aurora |

## Controls worth pointing at

- **Data perimeter on the gateway endpoints.** S3 and DynamoDB from inside the
  VPC reach only this account's resources (`aws:ResourceAccount`), plus the
  AWS-owned ECR layer bucket. Exfiltration to a foreign bucket fails at the
  network edge regardless of credentials.
- **EU-only model routing, twice.** The `bedrock-runtime` endpoint policy denies
  `global.*` inference profiles, on top of the IAM Deny in every role.
- **Default security group denies everything** (CIS 5.4).
- **Security groups reference each other, never CIDRs**, and egress is HTTPS or
  PostgreSQL only — no plain HTTP out.
- **Data tier has no internet route at all**, not even through the NAT.

## Cost (Zurich list prices, 2026-09)

| Item | ~USD / month |
|---|---|
| NAT gateway (USD 0.0572/h) + data | 42 + 0.057/GB |
| Interface endpoints, 6 × 2 AZs | ~115 |
| Gateway endpoints, SGs, subnets | 0 |

`interface_endpoints` is the lever: an empty list saves ~115/month and sends
that traffic through the NAT instead (still TLS, still AWS-owned endpoints).

## Deliberate trade-offs

One NAT gateway, not one per AZ: losing its AZ loses egress to external APIs
(swisstopo, Wikidata), while AWS traffic continues over the endpoints. Said out
loud, not hidden. The ALB listens on plain HTTP inside the VPC; TLS terminates
at CloudFront, and the hop is CloudFront VPC Origin → internal ALB over AWS's
private network. The ALB has no public address at all.
