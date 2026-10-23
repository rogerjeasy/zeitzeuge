# `database`

Aurora PostgreSQL 16 Serverless v2 — the system of record, the gazetteer
(pgvector) and the RLS policies that make tenant isolation a database property.

## What it is

| Setting | Value | Why |
|---|---|---|
| Capacity | 0 → 4 ACU, pauses after 30 min idle | pays only while used; set `min_capacity = 0.5` for the event |
| Subnets | data tier | no route to the internet, not even via NAT |
| TLS | `rds.force_ssl = 1` | plain-text connections refused inside the VPC too |
| Encryption | `database` CMK (storage), `secrets` CMK (master secret), `logs` CMK (log group) | |
| Data API | on | Lambda agents query over HTTPS + IAM, never join the VPC |
| Backups | 7 days, final snapshot on delete, deletion protection on | |

## Two credentials

- **master** (`zeitzeuge_admin`) — RDS generates, stores and rotates it. Only the
  migrate task reads it.
- **app** (`zeitzeuge_app`) — `NOSUPERUSER NOBYPASSRLS`, not the table owner, so
  every RLS policy applies. Generated here into the `db/app` secret; the migrate
  task creates the role from it. The API and agents only ever hold this one.

The random app password passes through Terraform state. State lives in a
private, TLS-only, versioned bucket only the builder can read; rotate the
password through the migrate task if that is ever not good enough.

## Not here

pgvector, RLS policies and grants are schema — `apps/api/migrations`.
