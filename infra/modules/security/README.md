# `security`

KMS keys, Secrets Manager containers, and every runtime IAM role. The single
place identity is defined: other modules receive ARNs and never create roles.

## Resources

| Kind | What |
|---|---|
| KMS | one CMK per data domain — `assets`, `database`, `search`, `logs`, `secrets` — yearly rotation, 30-day deletion window, alias `alias/zeitzeuge-prod-<domain>` |
| Secrets | containers only: `zeitzeuge/prod/db/app`, `zeitzeuge/prod/external/api-keys`. Values are set outside Terraform, so they never land in state |
| IAM roles | `zeitzeuge-prod-{ecs-task-execution, ecs-task-api, ecs-task-agents, lambda-agent-exec, sfn-orchestrator, sagemaker-exec}` |

## Invariants

- **Every role carries `ZeitzeugeBoundary`.** The builder policy refuses
  `iam:CreateRole` without it, so forgetting it fails at apply.
- **Permission policies come from `../../policies/*.json`**, rendered with
  `templatefile()`. Those files are what Access Analyzer validates.
- **KMS access is by tag, not by key list.** Roles may use keys tagged
  `Project=zeitzeuge, Env=prod` only — never another project's keys.
- **Confused-deputy protection.** ECS, Step Functions and SageMaker trust
  policies carry `aws:SourceAccount` (and `aws:SourceArn` where it is stable).

## Not here, on purpose

- **Aurora master password** — the database module sets
  `manage_master_user_password`; RDS owns and rotates it. The app uses the
  non-owner `db/app` role, so Postgres RLS applies to it.
- **API Gateway CloudWatch role** — `aws_api_gateway_account` is one
  account-wide setting shared with other projects here. HTTP API access logs
  do not need it; WebSocket execution logging would, and is left off.
- **Per-tenant CMKs** (PROPOSED_SOLUTION 10.5) — the production path. One
  tenant exists at hackathon scale, so one key per domain is the honest build.
