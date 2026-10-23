# `registry`

ECR, one repository per deployable image: `zeitzeuge/{api,web,agents,falsifier}`.

- **Immutable tags, except `latest`.** A deployed `sha` tag can never be
  overwritten; CI moves `latest`, which the ECS services track.
- **Scan on push** (basic scanning, free).
- **Lifecycle:** untagged layers after a day, last 10 images kept for rollback.
- **Lambda pull policy** on `agents`, limited to this account's
  `zeitzeuge-prod-agent-*` functions.

Build `api` for `linux/amd64` (its task runs on x86 Fargate); `agents` and `web`
build for `linux/arm64` (Graviton, ~20 % cheaper). A mismatched image fails at
task start with an exec-format error.
