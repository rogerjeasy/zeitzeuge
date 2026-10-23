# ZEITZEUGE — AWS runbook

Everything, in order, from an empty account to the pitch and back. Each step
says **who** does it (🔑 root in the console, 🧑‍💻 the builder at the terminal),
**how** to check it worked, and what it **costs**.

Account `707938860881` · home region `eu-central-2` (Zurich) · one environment: `prod`.

| Part | When | Status |
|---|---|---|
| [A. Account and identity](#a-account-and-identity) | 24–25 Sep | ✅ done |
| [B. State backend](#b-state-backend) | 24 Sep | ✅ done |
| [C. Every session: sign in](#c-every-session-sign-in) | each time | — |
| [D. First apply](#d-first-apply) | when you decide | ⬜ |
| [E. GitHub](#e-github-on-23-oct) | 23 Oct, repo creation | ⬜ |
| [F. First deploys, and the switches](#f-first-deploys-and-the-switches) | after E | ⬜ |
| [G. Event mode](#g-event-mode) | T-7 days and T-1 day | ⬜ |
| [H. Pitch checklist](#h-pitch-checklist) | 24 Oct | ⬜ |
| [I. After the event](#i-after-the-event) | 25 Oct+ | ⬜ |
| [J. When something breaks](#j-when-something-breaks) | — | — |
| [K. Reference](#k-reference) | — | — |

---

## A. Account and identity

**Done.** Recorded so it can be repeated in a fresh account and explained to a judge.

| # | Who | Step | Where it is recorded |
|---|---|---|---|
| A1 | 🔑 | MFA on root | — |
| A2 | 🔑 | Enable **Europe (Zurich)** — it is an opt-in region | *Account → AWS Regions* |
| A3 | 🔑 | **IAM user and role access to Billing information** → Activate | *Account* |
| A4 | 🔑 | Cost Explorer on (it was already) | *Billing → Cost Explorer* |
| A5 | 🔑 | **Receive CloudWatch billing alerts** → on | *Billing → Billing preferences* |
| A6 | 🔑 | Policy **`ZeitzeugeBoundary`** from `policies/boundary.json` | *IAM → Policies* |
| A7 | 🔑 | Policy **`ZeitzeugeBuilder`** from `policies/builder-user.json` | *IAM → Policies* |
| A8 | 🔑 | Group **`zeitzeuge-builders`** with `ZeitzeugeBuilder` only | *IAM → User groups* |
| A9 | 🔑 | User **`zeitzeuge-builder`**, console access, in that group — **no access keys** | *IAM → Users* |
| A10 | 🔑 | MFA on the user: passkey (Touch ID) + authenticator app as backup | *User → Security credentials* |
| A11 | 🧑‍💻 | `make preflight` — all green on 24 Sep | `scripts/00-preflight.sh` |
| A12 | 🧑‍💻 | Quota: **Fargate vCPU 6 → 40** — ✅ granted (40 confirmed 26 Sep; event peak ~17) | request `343b4ae8…`, support case 179028466500577 — mark resolved |
| A13 | 🧑‍💻 | Quota: **Lambda concurrency 10 → 1000** — ✅ approved 25 Sep | request `0792c1f9…` |

**Rules that follow from A:**

- The two policies are **root-only**. The builder is denied editing them
  (`NoSelfEscalation`). To change one: edit the file, then as root *IAM → Policies
  → name → Edit → JSON → paste → Save*. IAM keeps 5 versions; delete old ones on
  the *Policy versions* tab.
- **After every policy change:** `make verify-iam` must print *All guardrails hold.*
- Nothing from other projects in this account (wick, carecircle, CDK) is used.
  The one shared object is the GitHub OIDC provider — AWS allows one per account.

Check the quota requests:

```bash
aws service-quotas list-requested-service-quota-change-history --region eu-central-2 \
  --query 'RequestedQuotas[].[ServiceCode,QuotaName,DesiredValue,Status]' --output table
```

If a request goes to `CASE_OPENED` and AWS asks questions, answer in the
Support Center — the case auto-closes if ignored. Drafted answers are in the
conversation history; the substance: Linux, ARM64 + X86_64, ~100 people using
it at once on 23–24 Oct, data must stay in `eu-central-2`.

---

## B. State backend

**Done.** `infra/bootstrap` created bucket `zeitzeuge-tfstate-707938860881-euc2`
(versioned, encrypted, TLS-only, no public access, old versions expire after 90
days). Locking is S3-native (`use_lockfile`) — no DynamoDB table. Bootstrap's own
state was then migrated into the same bucket (`bootstrap/terraform.tfstate`).

Fresh account? `infra/bootstrap/README.md` has the two-step recipe.

---

## C. Every session: sign in

No access keys exist. The CLI borrows the console login:

```bash
aws login --profile zeitzeuge              # browser opens → password → Touch ID
export AWS_PROFILE=zeitzeuge
aws sts get-caller-identity --query Arn    # must end in user/zeitzeuge-builder
cd ~/Hackathons/zentralhackathon/historical_photo/zeitzeuge/infra
```

If the ARN shows anything else (e.g. `wick-dev`), `AWS_PROFILE` is not set in
that terminal. Stop and fix it before any Terraform command.

**Never let `aws login` pick up root.** It reuses whatever the browser is signed
in as. If it offers to overwrite the profile with `…:root`, answer **n**. Keep
root in a separate browser profile or a private window, so the everyday browser
is always the builder. If it happened anyway:

```bash
aws logout --profile zeitzeuge
aws configure set login_session arn:aws:iam::707938860881:user/zeitzeuge-builder --profile zeitzeuge
aws login --profile zeitzeuge              # browser signed in as zeitzeuge-builder
```

Sessions are short-lived by design (no access keys). "Your session has expired"
just means: `aws login --profile zeitzeuge` again.

---

## D. First apply

**Cost from this moment:** ~USD 92/month with no images pushed (NAT 46, ALB 23,
WAF 10, KMS 5, CloudWatch 5, secrets 2, Aurora paused ~1).

| # | Step | Check |
|---|---|---|
| D1 | `make init` | "Terraform has been successfully initialized" |
| D2 | `make plan` — read it. Expect **~250 to add, 0 to change, 0 to destroy** | no `Error`, nothing to destroy |
| D3 | `make apply` — shows the plan again, asks `y/N` | "Apply complete!" (Aurora and CloudFront take 10–15 min) |
| D4 | `make output` | `app_url` is `https://….cloudfront.net` |
| D5 | Two emails from AWS Notifications → **Confirm subscription** in both (alerts topic in Zurich, billing topic in us-east-1) | *SNS → Subscriptions*: both "Confirmed" |
| D6 | `make db-role` — creates the RLS-bound `zeitzeuge_app` role in Aurora | prints `superuser=False, bypassrls=False` |
| D7 | `make verify-iam` | *All guardrails hold.* |

At this point the app URL answers **503** — correct: no image is running yet.

Secrets to fill by hand (values never go through Terraform):

```bash
# only if an external source needs a key; {} is fine otherwise
aws secretsmanager put-secret-value --region eu-central-2 \
  --secret-id zeitzeuge/prod/external/api-keys --secret-string '{}'
```

---

## E. GitHub (on 23 Oct)

| # | Step |
|---|---|
| E1 | Create the repository **`rogerjeasy/zeitzeuge`** — exactly this name; the deploy role trusts only `repo:rogerjeasy/zeitzeuge:ref:refs/heads/main` |
| E2 | Push `main` |
| E3 | Secret and variable from `make output`: |

```bash
cd infra/envs/prod
gh secret   set AWS_DEPLOY_ROLE_ARN        --repo rogerjeasy/zeitzeuge --body "$(terraform output -raw deploy_role_arn)"
gh variable set ECS_MIGRATE_NETWORK_CONFIG --repo rogerjeasy/zeitzeuge --body "$(terraform output -raw migrate_network_configuration)"
```

That is all CI needs. It can push images and roll services; it **cannot** change
infrastructure, IAM, or delete anything. Infrastructure changes are always
`make plan` → read → `make apply`, by you, with MFA.

---

## F. First deploys, and the switches

Each service is created or scaled only once its image exists. For each one:
**push → flip the switch in `envs/prod/terraform.tfvars` → `make apply`.**

| Order | Push | Switch | Check |
|---|---|---|---|
| F1 | `apps/api` → workflow **deploy-api** (tests → image → migrate → roll) | `api_image_ready = true` | `aws elbv2 describe-target-health --region eu-central-2 --target-group-arn $(aws elbv2 describe-target-groups --region eu-central-2 --names zeitzeuge-prod-api --query 'TargetGroups[0].TargetGroupArn' --output text) --query 'TargetHealthDescriptions[].TargetHealth.State'` → all `healthy` |
| F2 | `apps/web` → workflow **deploy-web** | `web_image_ready = true` | the app URL loads the homepage |
| F3 | `services/agents` → workflow **deploy-agents** | `agents_image_ready = true` | 17 functions `zeitzeuge-prod-agent-*` exist |
| F4 | falsifier image to `zeitzeuge/falsifier` | `falsifier_image_ready = true` | endpoint `zeitzeuge-prod-falsifier` *InService* |

The first push of each image lands before its switch is on. That is fine: the
services already exist at 0 tasks (so "roll the service" rolls nothing), the
migrate task runs normally, and deploy-agents finds no functions to update yet.
Flip the switch, `make apply`, and the service starts on the image just pushed.

Seed the demo tenant and guest identity (after F1), using the API task — it holds
the Cognito permissions the seed needs:

```bash
cd infra/envs/prod
aws ecs run-task --region eu-central-2 --cluster zeitzeuge-prod \
  --task-definition zeitzeuge-prod-api --launch-type FARGATE \
  --network-configuration "$(terraform output -raw migrate_network_configuration)" \
  --overrides '{"containerOverrides":[{"name":"api","command":["python","-m","zeitzeuge_api.scripts.seed_demo"]}]}'
```

Then "Als Gast demo starten" works.

**Cost while building:** ~USD 180/month (1 API task, 1 web task, Aurora a few
hours a day). Bedrock is usage-based on top, with its own USD 600 budget.

---

## G. Event mode

**T-7 days** — in `envs/prod/terraform.tfvars`:

```hcl
interface_endpoints = ["bedrock-runtime", "ecr.api", "ecr.dkr", "logs", "secretsmanager", "states"]
api_min_tasks       = 2      # one per AZ
web_min_tasks       = 2
```

`make plan` (expect ~6 endpoints added, services scaled) → `make apply`.

**T-1 day:**

```hcl
db_min_capacity = 0.5    # no 15-second resume during the pitch
warm_agents     = true   # 5-minute pings on the pitch-path agents
```

→ `make apply`. Then warm everything once: run one full investigation end to
end, and fill `tool-cache` by running the demo photographs through it (the demo
must be fast and deterministic on venue Wi-Fi).

**Cost in event mode:** ~USD 13/day.

---

## H. Pitch checklist

Morning of 24 Oct:

- [ ] `make output` → `app_url` loads on a phone over mobile data (not the venue Wi-Fi)
- [ ] QR code on the last slide points at `app_url`
- [ ] "Als Gast demo starten" signs in
- [ ] One investigation runs to the archivist step
- [ ] Dashboard `zeitzeuge-prod-live` open in a tab (`make output` → `dashboard_url`),
      next to the Step Functions execution graph
- [ ] No alarm in *CloudWatch → Alarms* (`zeitzeuge-prod-*`)
- [ ] Budget emails so far: check the inbox for anything above 50 %

**During the pitch, if the room hammers it:** the WAF allows 50 000 requests per
5 min per IP overall (a room behind one venue IP is fine) and 300 per 5 min to
`/api/v1/auth/*`. If sign-ins get blocked, the fastest lever is the guest button,
which needs no sign-up.

---

## I. After the event

**Scale down** (keep it running for Kanton Schwyz to try) — revert G:

```hcl
interface_endpoints = []
api_min_tasks = 1
web_min_tasks = 1
db_min_capacity = 0
warm_agents = false
```

→ `make apply`. Back to ~USD 180/month.

**Tear down** (the project is over):

```bash
pip install boto3          # the script uses it to empty versioned buckets
make destroy               # 1) drops deletion protection  2) asks per bucket  3) destroys
```

Kept on purpose: the state bucket, Aurora's final snapshot `zeitzeuge-prod-final`,
any bucket you did not empty, the IAM user/group and the two policies. As root,
delete those by hand when the project is truly finished.

---

## J. When something breaks

| Symptom | Cause | Fix |
|---|---|---|
| `AccessDenied` on `iam:CreateRole` | the role lacks `permissions_boundary` | every `aws_iam_role` sets `permissions_boundary = var.permissions_boundary_arn` |
| `AccessDenied` on `iam:PassRole` / `CreateServiceLinkedRole` | a role not named `zeitzeuge-*`, or a new AWS service | rename, or add the service to `builder-user.json` → root pastes → `make verify-iam` |
| `AccessDenied` for any action in another region | the builder is fenced to `eu-central-2`, `eu-central-1`, `us-east-1` | intended; use the home region |
| Model call `AccessDenied` on `global.*` | EU-only routing is enforced in IAM **and** the Bedrock endpoint policy | use the `eu.*` / application profiles |
| API task stops at start with `exec format error` | image built for the wrong CPU | API → `linux/amd64`; web and agents → `linux/arm64` |
| API 500s on DB, `password authentication failed for zeitzeuge_app` | the role was never created, or the secret changed | `make db-role` (idempotent) |
| First request after a quiet hour takes ~15 s | Aurora resuming from 0 ACU | expected while building; `db_min_capacity = 0.5` for the event |
| `Throttles` alarm on Lambda | an agent hit its reserved cap of 50 | raise `agent_reserved_concurrency` (17 × cap must stay ≤ 900) and apply |
| No budget emails at all | budgets exclude credits — they *should* fire; check A5 and the SNS confirmations (D5) | |
| `terraform destroy` stops on Aurora / ALB / Cognito | deletion protection | use `make destroy`, never plain `terraform destroy` |

---

## K. Reference

**Identities**

| Name | Kind | Can |
|---|---|---|
| `zeitzeuge-builder` | IAM user (you), group `zeitzeuge-builders` | build in home regions; IAM only on `zeitzeuge-*`; cannot raise its own rights |
| `zeitzeuge-prod-github-deploy` | role, GitHub OIDC | push images, run migrate, roll services, update agents |
| `zeitzeuge-prod-{ecs-task-execution, ecs-task-api, ecs-task-migrate, ecs-task-agents, lambda-agent-exec, sfn-orchestrator, sagemaker-exec, cognito-pre-token, bedrock-logging}` | runtime roles | exactly their `policies/*.json`, under `ZeitzeugeBoundary` |

**Names** — everything is `zeitzeuge-prod-*` except ECR (`zeitzeuge/<service>`)
and secrets (`zeitzeuge/prod/<path>`).

**Documents**

| For | Read |
|---|---|
| why the IAM looks like this | `docs/iam-setup.md` |
| why Zurich, and the EU-only model routing | `docs/region-decision.md` |
| each module's resources and trade-offs | `modules/<name>/README.md` |
| each policy's purpose | `policies/README.md` |
| the whole graph on one screen | `envs/prod/main.tf` |

**Make targets:** `preflight` · `verify-iam` · `init` · `plan` · `apply` ·
`output` · `db-role` · `destroy` · `fmt` · `validate`.
