# `keyvalue`

DynamoDB, on-demand (no idle cost), `database` CMK, TTL wherever rows are
transient.

| Table | Key | TTL | Protection |
|---|---|---|---|
| `agent-memory` | `tenant_id` + `exemplar_id` | — | PITR + deletion protection: the one table whose loss is real |
| `idempotency` | `request_hash` | `expires_at` | |
| `tool-cache` | `pk` | `expires_at` | |
| `run-locks` | `run_id` | `expires_at` | |
| `rate-limit` | `pk` | `expires_at` | the API's auth throttling |

`tool-cache` is why the demo is fast and deterministic on venue wifi: warm it
during setup and treat a miss during the pitch as a failure, not an edge case.

The Terraform state lock is not here — backends use S3 native lock files.
