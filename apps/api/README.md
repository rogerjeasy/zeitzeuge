# ZEITZEUGE — API

The FastAPI gateway (PROPOSED_SOLUTION §9.3). This slice is **identity**:
registration, sign-in, password recovery, the archivist's profile and
preferences, profile pictures, sessions and API keys. The investigation
endpoints (`/assets`, `/runs`, `/records`, `/eval`) land on the same
foundation.

Nothing here is a mock. Credentials live in **Amazon Cognito**, rows live in
**Aurora PostgreSQL** behind row-level security, pictures live in **S3** behind
presigned tickets, throttles live in **DynamoDB**, and secrets are read from
**Secrets Manager** by reference. The AWS resources are created by
`infra/` — until they exist, `make up` runs Postgres and *moto* (the real AWS
APIs, in a container) so the service can be run and tested end to end.

---

## Quick start

```bash
cp .env.example .env
poetry install
make up            # Postgres :5432 · AWS emulator :5001
make migrate
make run           # → http://localhost:8000/docs
make test          # the unit suite; no Docker needed
```

**Swagger UI is at `/docs`**, the raw document at `/openapi.json`. Both are
served without a database, without Cognito and without an AWS account — the
service starts degraded and says so at `/readyz` — so the API surface can be
read and reviewed before any infrastructure exists. Click **Authorize**, paste
an access token from `POST /auth/login` (or a `zz_live_…` API key), and every
protected endpoint carries it. Docs are disabled when `ZZ_ENV=prod`.

Prerequisites, and what to do if they are missing:

| Need | If absent |
|---|---|
| Python **3.12** (`pyproject` targets it; asyncpg publishes no 3.14 wheels) | `conda create -n zeitzeuge python=3.12` then `poetry env use $(conda run -n zeitzeuge which python)` |
| Poetry **2.x** (2.5.1 is pinned in the Dockerfile and CI — a Poetry 2 lock file is unreadable to Poetry 1.8) | `pipx install poetry`; if the shell then cannot find it, `pipx ensurepath` and open a new shell |
| The Docker **compose** plugin (`make up`) | Start the two containers by hand — see below |

```bash
# `make up` without the compose plugin
docker run -d --name zz-db -p 5432:5432 \
  -e POSTGRES_USER=zeitzeuge -e POSTGRES_PASSWORD=zeitzeuge -e POSTGRES_DB=zeitzeuge \
  -v "$PWD/docker/initdb:/docker-entrypoint-initdb.d:ro" pgvector/pgvector:pg16
docker run -d --name zz-aws -p 5001:5000 motoserver/moto:5.0.16
```

Or skip local Python entirely and read the docs from the image:

```bash
docker build -t zeitzeuge-api .
docker run --rm -p 8000:8000 -e ZZ_ENV=local zeitzeuge-api   # → :8000/docs
```

## What the infrastructure must provide

The defaults reconstruct Terraform's `${project}-${env}-…` names, so a deployed
task needs little configuration. What it does need:

| Resource | Requirement | Why |
|---|---|---|
| Cognito user pool | `email` as the username attribute; custom attributes `tenant_id` and `role`; groups `admin`, `archivist`, `reviewer`, `operator`, `reader`, `guest` | The group carries the role into the token; `tenant_id` carries the archive |
| Cognito app client | `ALLOW_ADMIN_USER_PASSWORD_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH`, a client secret, `PreventUserExistenceErrors = ENABLED` | The API is a confidential server-side client (see `integrations/aws/cognito.py`) |
| Pool password policy | 8+, upper, lower, digit, symbol | Must match `schemas/password.py` and `apps/web/src/lib/auth/password.ts` |
| Aurora | A database and a **non-superuser, non-`BYPASSRLS`** role (`zeitzeuge_app`) | A superuser ignores every policy in the migration |
| S3 | One bucket; `avatars/` prefix; SSE-KMS with the tenant CMK | Direct browser upload, size- and type-bounded by the presigned policy |
| DynamoDB | Table with partition key `pk` (S) and TTL on `expires_at` | Auth throttling |
| Secrets Manager | The Cognito client secret, the Aurora secret, the demo password | Referenced as `secretsmanager://arn#key`; never in a task definition |
| IAM task role | `cognito-idp:AdminInitiateAuth` and friends, `s3:PutObject/GetObject/DeleteObject` on the avatar prefix, `dynamodb:UpdateItem`, `secretsmanager:GetSecretValue`, `kms:GenerateDataKey/Decrypt` | Least privilege, scoped to those prefixes |

Then:

```bash
poetry run python -m zeitzeuge_api.scripts.seed_demo    # demo tenant + guest user
```

## The endpoints

```
POST   /api/v1/auth/register            create an account (founds or joins an archive)
POST   /api/v1/auth/verify              confirm the address with the mailed code
POST   /api/v1/auth/verify/resend       send a new code                         202
POST   /api/v1/auth/login               → tokens, or an MFA / new-password challenge
POST   /api/v1/auth/challenge           answer that challenge
POST   /api/v1/auth/refresh             exchange a refresh token
POST   /api/v1/auth/logout              this device, or all of them             204
POST   /api/v1/auth/password/forgot     begin a reset (always 202)              202
POST   /api/v1/auth/password/reset      complete it; every session is signed out
POST   /api/v1/auth/password/change     change it while signed in               204
POST   /api/v1/auth/mfa/totp            begin enrolling an authenticator
POST   /api/v1/auth/mfa/totp/verify     confirm it and switch MFA on            204
DELETE /api/v1/auth/mfa/totp            switch MFA off                          204
POST   /api/v1/auth/guest               "Als Gast demo starten" (§9.2 screen 2)

GET    /api/v1/users/me                 profile, organisation, signed avatar URL
PATCH  /api/v1/users/me                 name, title, department, phone, bio, locale, timezone
GET    /api/v1/users/me/preferences     appearance · notifications · cataloguing
PATCH  /api/v1/users/me/preferences     any subset of those three groups
POST   /api/v1/users/me/avatar/ticket   presigned POST, bounded by size and type
PUT    /api/v1/users/me/avatar          confirm the upload
DELETE /api/v1/users/me/avatar          remove it
POST   /api/v1/users/me/email           request an address change               202
POST   /api/v1/users/me/email/verify    confirm it with the mailed code
GET    /api/v1/users/me/sessions        devices currently signed in
DELETE /api/v1/users/me/sessions/{id}   end one                                 204
DELETE /api/v1/users/me                 delete the account (keeps attribution)  204

GET    /api/v1/api-keys                 list
POST   /api/v1/api-keys                 issue (the secret is shown once)        201
DELETE /api/v1/api-keys/{id}            revoke                                  204

GET    /healthz                         liveness (touches nothing)
GET    /readyz                          readiness (checks Aurora)
```

Full schema at `/docs` — Pydantic models are the contract (§9.1).

## Seven decisions worth reading

1. **Cognito owns the credential.** No password is stored, hashed or logged
   here. Lockout, MFA, the reset mail and adaptive authentication are Cognito's
   — and the API forwards the caller's real IP so adaptive auth scores the
   browser rather than a Fargate ENI.
2. **Row-level security is the isolation, not the application.** Every
   transaction announces its tenant (`SET LOCAL app.org_id`) and every policy
   is written against it. `tests/test_rls.py` opens a session as one archive
   and tries to read, update, delete and insert into another's rows; all four
   fail. The migration `FORCE`s RLS, because without it the table owner
   silently bypasses every policy.
3. **One pre-authentication path, and it is named.** Sign-in cannot know its
   tenant before it has authenticated, so it runs as `bootstrap` — SELECT on
   three identity tables — and leaves it the moment the caller is recognised.
4. **No account enumeration.** Sign-in, reset and resend answer identically for
   an address that exists and one that does not. Registration is the single
   exception (the UI needs `email_in_use`) and is limited to five per hour per
   IP.
5. **The audit trail survives failure.** A failed sign-in is the row that
   matters most, and the request that produced it is about to roll back — so
   those entries are written on their own connection. The trail is
   append-only: no UPDATE or DELETE policy exists, and the application role's
   privileges for both are revoked.
6. **Bytes never pass through the API.** A profile picture goes straight from
   the browser to S3 under a ticket that pins the key, the size range, the
   content type and SSE-KMS. A guessed key is refused before S3 is called.
7. **An API key is weaker than its owner.** Same tenant, `read` or `write`
   intersected with the owner's role, stored only as a SHA-256 digest, and
   barred from touching credentials or minting another key.

## Layout

```
src/zeitzeuge_api/
├── main.py              app factory, lifespan, the problem+json handlers
├── core/                config · errors · logging · security (JWT) · context · time
├── api/                 deps (identity) · router · v1/{auth,users,api_keys,health}
├── schemas/             the request/response contract, incl. the password policy
├── services/            auth · user · api_key · audit — every decision lives here
├── db/                  engine, tenant context, models
├── integrations/aws/    cognito · s3 · dynamodb · secrets · clients
├── middleware/          request id, security headers
└── scripts/seed_demo.py the demo tenant and guest identity
migrations/              Alembic; 0001 carries the RLS policies and grants
tests/                   unit (moto + SQLite) · integration (`-m integration`, Postgres)
```

## Deploying

`.github/workflows/deploy-api.yml` lints, type-checks and tests, then builds for
`linux/amd64`, pushes to ECR and rolls the ECS service. Migrations run as a
**one-off ECS task inside the VPC** (`<service>-migrate`, the same image with
`alembic upgrade head` as its command) — Aurora lives in private subnets and a
GitHub runner cannot reach it. `checks.yml` runs the cross-tenant isolation
suite against a real PostgreSQL on the same commit.

Not yet wired, and deliberately visible rather than hidden:

- `infra/modules/auth` and the rest of `infra/` are still stubs — this service
  codes against the contract in the table above, and `infra/modules/auth/main.tf`
  now carries that contract as a comment.
- `poetry.lock` is created by the first `poetry install`. Commit it.
- The migrate task definition comes from `infra/modules/compute-api`; until it
  exists, run `alembic upgrade head` from a bastion or a local tunnel.

## Testing

```bash
make test                       # 65 unit tests, no Docker, moto for AWS
make up
ZZ_TEST_POSTGRES_DSN=postgresql+asyncpg://zeitzeuge_app:zeitzeuge_app@localhost:5432/zeitzeuge \
  poetry run pytest -m integration     # the cross-tenant isolation suite
make check                      # lint + types + tests, as CI runs them
```

The isolation suite **refuses to run as a superuser** — a superuser bypasses
RLS, so it would pass without proving anything.
