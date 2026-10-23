# ZEITZEUGE — infrastructure

Terraform for the AWS account behind the agentic provenance pipeline. The
architecture this implements is Part III §10 of `docs/PROPOSED_SOLUTION.md`;
this directory is the part of it that actually exists.

## Shape

```
infra/
├── bootstrap/          run once, local state: state bucket (S3 native locking), GitHub OIDC reference
├── envs/
│   └── prod/           the only environment — built, demoed and judged from here
├── modules/            17 modules, one concern each — see the table below
├── policies/           IAM policy JSON, rendered with templatefile()
├── scripts/            preflight, bootstrap, model access, apply, teardown
└── docs/               the decisions worth writing down
```

Two-level layout on purpose: environment roots compose modules, modules never
call each other. Cross-module references go through explicit outputs, so the
dependency graph in `envs/prod/main.tf` is the whole architecture on one screen.

## Order of operations

**Follow [`docs/RUNBOOK.md`](docs/RUNBOOK.md)** — every step from an empty
account to the pitch and the teardown, with who does it, how to check it, and
what it costs. In short:

```bash
aws login --profile zeitzeuge && export AWS_PROFILE=zeitzeuge
make preflight            # account usable? (done 24 Sep: all green)
make verify-iam           # builder guardrails hold?
make plan                 # read it
make apply                # ~250 resources
make db-role              # RLS-bound app role in Aurora, before the first migration
make output               # app URL, dashboard, CI secrets
```

Bootstrap (state bucket) and model access are already done in this account.

## Modules

| Module | Owns |
|---|---|
| `network` | VPC, 3 subnet tiers × 2 AZs, one NAT, gateway + interface endpoints with data-perimeter policies, security groups |
| `security` | 5 KMS keys, secret containers, every runtime IAM role (all under `ZeitzeugeBoundary`) |
| `storage` | 7 buckets — `originals` write-once, versioned, Object Lock, inventoried |
| `database` | Aurora PostgreSQL 16 Serverless v2 (0–4 ACU, Data API, TLS-only) + the RLS-bound app credential |
| `keyvalue` | DynamoDB: agent memory, idempotency, tool cache, run locks, rate limit |
| `search` | OpenSearch Serverless — **off by default** (~USD 222/month floor) |
| `auth` | Cognito (Plus): pool, 6 groups, confidential API client, M2M client, pre-token hook for `tenant_id` |
| `bedrock` | guardrail (incl. "no identifying people"), invocation logging, 3 EU-only application inference profiles |
| `registry` | ECR `zeitzeuge/{api,web,agents,falsifier}` |
| `compute-api` | ECS cluster, internal ALB, `api` + `web` services, migrate task, autoscaling |
| `compute-agents` | 17 Lambda agents (arm64, outside the VPC) + the deep-agent Fargate task |
| `inference` | SageMaker Serverless falsifier endpoint |
| `orchestration` | Step Functions `investigation` + `bulk`, logged at ALL, traced, KMS-encrypted |
| `frontend` | CloudFront + WAF + VPC Origin — the only public entry point |
| `observability` | alerts topic, alarms across the path, `zeitzeuge-prod-live` dashboard, X-Ray |
| `cost` | budgets against the credit (credits excluded), Bedrock budget, billing alarm |
| `cicd` | the GitHub OIDC deploy role — no IAM, no deletes, no Terraform |

## Request path

```
phone ─HTTPS/H3─▶ CloudFront + WAF ─VPC Origin─▶ internal ALB ─┬─ /api/* ─▶ FastAPI (Fargate)
                                                               └─ /*     ─▶ Next.js (Fargate)
FastAPI ─StartExecution─▶ Step Functions ─▶ Lambda agents ─▶ Bedrock (eu.* only)
                                        └─▶ SageMaker falsifier (fallback: cached horizons)
```

No API Gateway: the API validates Cognito JWTs itself and serves WebSockets,
so a gateway would add a hop, a bill and a second place for auth to drift. No
public load balancer: CloudFront reaches the ALB through a VPC Origin.

## Switches that follow the build

Everything applies on day one. Four switches in `terraform.tfvars` flip as CI
pushes the first image of each service:

| Switch | Creates / scales |
|---|---|
| `api_image_ready` | the API service from 0 to `api_min_tasks` |
| `web_image_ready` | the web service from 0 to `web_min_tasks` |
| `agents_image_ready` | the 17 agent functions and the warm-up rule |
| `falsifier_image_ready` | the SageMaker model, config and endpoint |

## Decisions already made

- **Region `eu-central-2` (Zurich).** Swiss scans do not leave Switzerland;
  frontier reasoning uses an EU cross-region inference profile. §10.3.
- **Step Functions, not application code, owns the flow.** Tool output can
  never alter control flow, which is the prompt-injection answer in §10.5.
- **No long-lived AWS keys anywhere.** CI assumes a role via OIDC with a trust
  policy pinned to one repo and one ref.
- **One NAT gateway, not one per AZ.** A deliberate single point of failure for
  a project with a 24-hour lifespan. Said out loud, not hidden.
- **The human builder is fenced, not admin.** `ZeitzeugeBuilder` + `ZeitzeugeBoundary`,
  proven by `make verify-iam`. See `docs/iam-setup.md`.
- **CI ships images, never infrastructure.** Terraform is applied by the builder
  with MFA after a reviewed plan; `infra-check` only formats and validates.

## What is not here

Database schema, RLS policies and migrations live with the API
(`apps/api/migrations`). Step Functions ASL lives in
`orchestration/statemachines/` and is templated in — JSON embedded in HCL is
neither readable nor lintable.

## One environment, on purpose

There is no `dev`. A 24-hour project with a USD 2000 credit cannot justify
paying twice for NAT, endpoints, Aurora and OpenSearch. Changes are gated by
`terraform plan` review and `make verify-iam` instead of a second copy of the
account.
