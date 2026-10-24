<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/zeitzeuge-lockup-dark.png">
    <img src="apps/web/public/brand/zeitzeuge-lockup.png" alt="ZEITZEUGE" width="360">
  </picture>
</p>

<p align="center">
  <strong>Geographic metadata for archive photographs — with evidence, or an honest blank.</strong><br>
  <em>«We cross-examine the photograph.»</em>
</p>

<p align="center">
  <a href="https://github.com/rogerjeasy/zeitzeuge/actions/workflows/ci-api.yml"><img alt="ci-api" src="https://github.com/rogerjeasy/zeitzeuge/actions/workflows/ci-api.yml/badge.svg"></a>
  <a href="https://github.com/rogerjeasy/zeitzeuge/actions/workflows/ci-web.yml"><img alt="ci-web" src="https://github.com/rogerjeasy/zeitzeuge/actions/workflows/ci-web.yml/badge.svg"></a>
  <a href="https://github.com/rogerjeasy/zeitzeuge/actions/workflows/deploy-api.yml"><img alt="deploy-api" src="https://github.com/rogerjeasy/zeitzeuge/actions/workflows/deploy-api.yml/badge.svg"></a>
  <a href="https://github.com/rogerjeasy/zeitzeuge/actions/workflows/deploy-web.yml"><img alt="deploy-web" src="https://github.com/rogerjeasy/zeitzeuge/actions/workflows/deploy-web.yml/badge.svg"></a>
  <br>
  <img alt="Python 3.12 · FastAPI" src="https://img.shields.io/badge/Python%203.12-FastAPI-0d1b2a">
  <img alt="Next.js 16 · React 19" src="https://img.shields.io/badge/Next.js%2016-React%2019-0d1b2a">
  <img alt="PostgreSQL 16 · row-level security" src="https://img.shields.io/badge/PostgreSQL%2016-row--level%20security-2a78d6">
  <img alt="AWS eu-central-2 Zurich" src="https://img.shields.io/badge/AWS-eu--central--2%20Zurich-ff9900">
  <img alt="572 tests" src="https://img.shields.io/badge/tests-494%20API%20%C2%B7%2078%20web-1baf7a">
  <img alt="de · fr · en" src="https://img.shields.io/badge/i18n-de%20%C2%B7%20fr%20%C2%B7%20en-8a6d3b">
</p>

<p align="center">
  <strong><a href="#demo">Watch the demo (1:30)</a></strong> ·
  <strong><a href="https://d8ic8dbboqgce.cloudfront.net/de">Open the live app</a></strong> ·
  «Demo starten» opens an archive of your own, no account needed ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="docs/data-model.md">Data model</a> ·
  <a href="infra/docs/RUNBOOK.md">Runbook</a>
</p>

> **Zentral Hack 2026** · Challenge «KI-Bilderkennung für historische Fotos» · Staatsarchiv des Kantons Schwyz

<a id="demo"></a>

https://github.com/user-attachments/assets/ddd432dc-e392-4f7d-8f46-96a4641c3907

<sub>90 seconds on the live app, 24.10.2026: «Demo starten» without an account, a ZIP of Prio-1 photos, the live run, the review screen with confidence, objections and evidence, the cost report and the Excel export. <a href="https://github.com/rogerjeasy/zeitzeuge/releases/tag/demo-video">Full-resolution download</a>.</sub>

---

## In one minute

The Staatsarchiv Schwyz holds about 600 digital photographs with no geographic metadata. For each one it wants five fields, in this order: **Ortschaft → politische Gemeinde → Gebäude → See / Fluss / Berg → Strasse**. Every value must be traceable to a source and carry an explained confidence. When nothing supports a value, the field must stay empty.

ZEITZEUGE investigates each photograph like a witness. Models read the picture, search the web and compare images. They may **propose** a name, but they never **settle** one. A name is accepted only when independent sources tie *this photograph* to *that place*. The confidence comes from a fixed, published rule over that evidence, never from the model's own number. The result is one Excel row per photograph, with every source behind it.

| On the Prio-1 set, 24.10.2026 | |
|---|---|
| Photos investigated | **49 of 50** (one run failed and is shown as failed) |
| Correct where a field was filled, against the team's labels | **79 %** (34 of 43 labelled fields, 17 photos) |
| Fields at confidence ≥ 0.90 that were correct | **11 of 13**; the two misses are naming disputes (Bisisthal vs Muotathal, Lauerz vs Insel Schwanau) |
| Ranked fields deliberately left open | **43 %**, each with its reason in the workbook |
| Investigation time | **7 min 2 s** average, 4 min 53 s median, 12.5 photos an hour in parallel |
| Cost | **$ 0.52** per photograph, every model call metered |

## Why this is hard

A vision model asked «where is this?» answers fluently, and is often wrong in a way that *looks* sourced. On one Prio-1 photograph a web-searching model found a genuine catalogue entry and a genuine hospital address, then named the wrong building at 0.84 confidence. An archive filled with rows like that is worse than an empty one. An earlier attempt at this task failed for exactly this reason: confident guesses nobody could verify.

So ZEITZEUGE is built on one rule. **A model may propose a value; only evidence may settle it.**

## How a photograph is investigated

Eleven stages. Models read, search, compare and object. Code groups the evidence, computes the number and writes the record.

| # | Stage | What happens | Done by |
|---|---|---|---|
| 1 | **Intake** | SHA-256, EXIF date and camera. GPS counts as a hypothesis, not a fact. | code |
| 2 | **Perception** | One careful look at the photo. It names candidates only, with a capped strength. | Claude Opus 4.6 |
| 3 | **Research** | GPT-5.5 and Gemini search the web independently. Every page they cite is fetched and checked. Starts in the background at Intake. | OpenAI · Google |
| 4 | **Sighting** | Looks for the same view published elsewhere: Cloud Vision web detection, Google Lens, landmarks, text in the image. | Google |
| 5 | **Grounding** | Every candidate name is resolved in official registers: swisstopo, the building register GWR, the cantonal heritage inventory (KSI), Wikidata, Google Places. Alpine names (Alp, Flur, Pass) are included. | code |
| 6 | **Reference** | Compares the photo with the candidate's *own* pictures: the inventory, Wikidata, Places, research finds, the Staatsarchiv catalogue and Street View. Is it the same building? | Claude Sonnet 4.6 |
| 7 | **Resolve** | Once a point is fixed, Ortschaft, Gemeinde and Strasse are read from the federal registers, each as its own evidence. | code |
| 8 | **Hypothesise** | Evidence naming the same value is grouped into one hypothesis per field, and the confidence is computed. | code |
| 9 | **Check** | A different model family tries to break the leading hypothesis. It may object; it may never add evidence or choose. | GPT-6.1 Sol |
| 10 | **Adjudicate** | Picks a hypothesis per field and cites evidence. The citations are verified against the ledger. | Claude Opus 4.6 + rule |
| 11 | **Produce** | Writes the versioned catalogue record and the Excel row. | code |

### The confidence rule

```
confidence = 1 − Π over source classes (1 − weight_class × strongest_strength_class)
           × Π over upheld objections (1 − severity)
```

| Score | Decision | In the workbook |
|---|---|---|
| ≥ 0.90 | accept | «übernahmefähig» |
| ≥ 0.50 | accept, flag for review | «Prüfbedarf» |
| < 0.50 | abstain | cell left empty, reason recorded |

Each source class counts **once**, with its strongest item, so ten copies of one web page are one source. A model's own observation is capped and weighted low. A register lookup proves that a name *exists*, not that the photo *shows* it, so it weighs 0.35. A street derived from a building can never be surer than the building. Counter-evidence counts only against the candidate's own pictures, never against a namesake elsewhere. The weights are in [`confidence.py`](apps/api/src/zeitzeuge_api/investigation/confidence.py), and the rule is spelled out in German in the workbook's «Methode» sheet.

### A worked example: SG.CIV.17.94

| Field | Value | Confidence | Confirmed by |
|---|---|---|---|
| Ortschaft | Gersau | 0.95 | geodata · reference image · AI research · image on the web · image content |
| Gemeinde | Gersau (BFS 1311) | 0.89 — Prüfbedarf | geodata · reference image · AI research |
| Gebäude | Seehotel Schwert | 0.96 | geodata · reference image · AI research · image on the web · Street View |
| See / Fluss / Berg | Vierwaldstättersee | 0.91 | geodata · AI research · image on the web · image content |
| Strasse | — | abstained | official address and web sources disagree (28 vs 29), no house number is legible |

All four filled values match the team's labels. Leaving the street open is the system doing its job.

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/architecture/architecture-dark.png">
  <img src="docs/architecture/architecture-light.png" alt="ZEITZEUGE architecture. Archivists, demo visitors and integrations reach CloudFront with WAF, which forwards through a VPC origin to an internal load balancer; Cognito holds credentials. In private subnets on ECS Fargate run the Next.js web app, the FastAPI API and the investigation worker. Data lives in Aurora PostgreSQL 16 with forced row-level security, S3 with KMS, DynamoDB and Secrets Manager. Models are Claude Opus, Sonnet and Haiku through Bedrock EU profiles, plus a cross-family GPT red team, GPT web research and Gemini with Google Search. Evidence comes from swisstopo, the building register, the Schwyz heritage inventory, the Staatsarchiv catalogue, Wikidata, OpenStreetMap and Google Vision, Lens, Places and Street View. GitHub Actions deploy over OIDC; Terraform defines 17 modules. A strip shows the eleven investigation stages, coloured by whether code or a model does the work.">
</picture>

<sub>Drawn from <a href="docs/architecture/architecture.html"><code>docs/architecture/architecture.html</code></a>. <code>docs/architecture/render.sh</code> redraws both themes. Every box exists in <code>apps/</code> or <code>infra/</code>, or is a live dependency.</sub>

**The browser renders and never decides. The API authenticates and owns tenancy. The worker investigates. The database enforces the rules a careless change could break.**

### Technology

| | Used for |
|---|---|
| **Next.js 16 · React 19** | Upload by drag-and-drop or ZIP, a live batch view over Server-Sent Events, the review screen with map and evidence, evaluation, costs and settings. Server actions only: tokens live in HttpOnly cookies and never reach browser code. next-intl in German, French and English. Tailwind 4. |
| **FastAPI · Pydantic 2 · SQLAlchemy 2 async** | Identity and tenancy, batches, runs, field review with optimistic concurrency, Excel export, QC import, cost reports. Typed problem responses (RFC 9457). Alembic migrations, each with its row-level security (RLS) policies. |
| **Investigation worker** | Runs in the API task. Claims queued runs with `FOR UPDATE SKIP LOCKED`. A pacer per model id, back-off on throttling, fallbacks (Opus 4.6 → 4.5, Sonnet → Haiku). Circuit breakers for slow public services. |
| **Amazon Bedrock (EU profiles)** | Claude Opus 4.6 perceives and adjudicates. Claude Sonnet 4.6 compares references and extracts. Claude Haiku 4.5 is the fallback. A Bedrock Guardrail and invocation logging sit around them. |
| **Cross-family models** | GPT-6.1 Sol as the red team, through Bedrock `global.*`. GPT-5.5 with web search and Gemini with Google Search as two independent research families. |
| **Official and open data** | swisstopo GeoAdmin (localities, swissBOUNDARIES3D, swissNAMES3D), building register GWR, Kanton Schwyz heritage inventory (KSI WFS), the Staatsarchiv catalogue (scopeArchiv), Wikidata, Wikimedia Commons, OpenStreetMap. |
| **Google** | Cloud Vision (OCR, web detection, landmarks), Lens through SerpApi, Places photos, and Street View restricted to Google's own panoramas. |
| **Aurora PostgreSQL 16** | System of record. RLS forced on every tenant table, an append-only evidence ledger, versioned records, an audit log. |
| **AWS** | CloudFront, WAF, a VPC origin, an internal ALB, ECS Fargate, Cognito, S3 with KMS, DynamoDB rate limits, Secrets Manager, CloudWatch and budgets. All in Terraform, deployed by GitHub Actions over OIDC. |

### Rules that hold everywhere

These are enforced in code, and where possible in the database as well.

1. **An emitted field cites evidence.** It is checked before persistence, and again by a deferred database trigger (`zz_field_requires_evidence`).
2. **A model never controls the flow.** Model output is a value in the ledger. The stage order and the confidence live in code.
3. **Tenants are isolated by RLS.** The pipeline runs under the run's tenant, exactly like the API. The isolation suite refuses to run as a superuser, because a superuser bypasses RLS.
4. **The ledger is append-only.** A human decision is a new record version, never an overwrite. A failed run keeps its record, and a retry is a new run. The only hard delete is a `SECURITY DEFINER` function scoped to the caller's own failed runs.
5. **The red team is another model family.** If that call fails, the fallback is used and the workbook says so.

## What the archive gets

- **The workbook**, with four sheets.
  - `Ergebnisse`: one row per photograph — file name and SHA-256, the five fields, a confidence and sources per field, status, Prüfbedarf, Unbestimmt with its reason, QC state and timings.
  - `Belege`: every piece of evidence with source, URL, observation, strength, agent and model.
  - `Methode`: the rule in plain German, with worked numbers.
  - `Spalten`: each column mapped to ISAD(G), Dublin Core, EAD3 and scopeArchiv.
- **A review loop.** For each field an archivist can accept, correct or reject, with the photo, the map, the evidence and the red-team objections beside it. Keyboard shortcuts and bulk accept are available. Each decision is a new audited version.
- **Measured quality.** Import the team's checked workbook (green cells count as correct) and the Evaluation page shows the override rate per field, the hit rate per field and calibration by confidence band.
- **Transparent cost.** Spend per day, provider, model, stage and batch, plus a projection for the remaining holdings.
- **A demo that needs no account.** «Demo starten» creates a private archive with full rights, isolated by RLS and capped at 10 photos, 5 concurrent runs and 5 archives per IP per hour. «Als Gast ansehen» opens the published collection read-only.

## What is real, and what is not yet

| | Status |
|---|---|
| Pipeline, review, export, QC import, costs | Live on AWS in Zurich. Used for the Prio-1 run above. |
| Prio-1 set | 50 photographs uploaded, 49 investigated. The one failed run is shown and can be purged. |
| Labels used for the scores | The team's own checks on 17 photographs, not an independent gold set. The workbook says so. Some labels name a hamlet (Stoos, Goldau) where the brief asks for the political municipality; those are reported, not scored. |
| The horizon animation on the home page | Illustrative. Terrain matching against swissALTI3D is designed (architecture §5.6) but not built. |
| Lambda agents and the SageMaker falsifier in `infra/` | Defined in Terraform, but switched off (`agents_image_ready = false`, `falsifier_image_ready = false`). The worker inside the API is the production path. |
| The remaining ~550 photographs | Not yet run. The cost page projects about $ 0.52 each. |

## Engineering standards

Quality is enforced by gates, not by hope. Every rule below runs in CI or in the database.

| Practice | How it is enforced |
|---|---|
| **Static typing** | Python: mypy with `disallow_untyped_defs`, `strict_optional` and `warn_unused_ignores`. TypeScript: `strict: true`, plus `tsc --noEmit` in CI. |
| **Linting** | Ruff with pycodestyle, pyflakes, isort, bugbear, pyupgrade, **bandit security rules (`S`)**, async pitfalls (`ASYNC`) and Ruff's own rules. Every ignored rule is listed with its reason in `pyproject.toml`. ESLint 9 with the Next.js config. |
| **Tests** | **494 API tests**, run against moto (the real Cognito, S3 and DynamoDB APIs, in process) and SQLite. The RLS isolation suite runs on real PostgreSQL 16 in CI as a non-superuser. **78 web tests** on Node's own test runner, including one that requires every locale to have exactly the keys German has. |
| **Database as the last line** | Constraints, a deferred evidence trigger, forced RLS through 20 policy definitions applied across the tenant tables, and append-only ledger tables with no `DELETE` grant. |
| **Migrations** | Alembic, with an upgrade and a downgrade each. Every migration ships its RLS policies and grants in the same file. |
| **Security review per change** | Each commit is reviewed for security. Findings are fixed in follow-up commits named after the finding, for example SSRF on fetched URLs, DNS rebinding, PDF and ZIP decompression bombs, and spend-cap races. |
| **Outbound safety** | Every fetch of a URL a model cited goes through `guarded_get`. It allows HTTPS only and public addresses only, pins the IP and re-checks every redirect. Size caps apply. Parsing runs in a separate executor with a deadline. |
| **Supply chain** | `poetry.lock` and `package-lock.json` are committed. CI installs with `npm ci` and a pinned Poetry. Images are tagged `:<sha>`, task revisions are pinned, and there are no long-lived cloud keys (OIDC only). |
| **Infrastructure** | `terraform fmt -check`, validate and a plan in CI (`infra-check`). A person applies. The deploy role is explicitly denied deleting buckets, databases and tables, and a permissions boundary caps the builder. |
| **Decisions are written down** | Architecture decision records (ADR-01 … ADR-18) in [`docs/architecture.md`](docs/architecture.md), a full [data model](docs/data-model.md), and a design note per feature under [`docs/superpowers/specs/`](docs/superpowers/specs/). Commit messages explain *why*, not just *what*. |
| **Honest UI** | No dummy data behind a login: real data or an explained empty state. Every user-facing string is translated into three languages. Charts use colour palettes checked for colour blindness, and have a table view. |

**CI gates**, path-filtered so each change runs only what it touches:

```
ci-api       ruff · mypy · pytest (moto + SQLite) · RLS suite on PostgreSQL 16
ci-web       eslint · tsc --noEmit · node:test · next build
infra-check  terraform fmt · validate · IAM policy JSON
deploy-*     the matching CI first, then build, migrate, roll and smoke-test
```

## Repository layout

```
zeitzeuge/
├── apps/
│   ├── api/                 FastAPI + investigation pipeline (Python 3.12, Poetry)
│   │   ├── src/zeitzeuge_api/
│   │   │   ├── api/v1/          routes: thin, typed, one status code per meaning
│   │   │   ├── services/        auth, investigation, QC, costs, mirror, QC import
│   │   │   ├── investigation/   the 11 stages, confidence rule, ledger, worker, tools
│   │   │   └── db/              models, sessions with tenant context
│   │   ├── migrations/          Alembic, each with its RLS policies
│   │   └── tests/               494 tests; the RLS suites need PostgreSQL
│   └── web/                 Next.js 16 front end; messages/{de,fr,en}.json
├── infra/                   Terraform: bootstrap, envs/prod, 17 modules, IAM policies, runbook
├── orchestration/           Step Functions definitions (ASL)
├── docs/                    architecture · data model · brief review · design notes · diagram
└── .github/                 ci-api · ci-web · infra-check · deploy-api · deploy-web
```

## Run it locally

No AWS account is needed for the app itself. PostgreSQL and moto stand in for Aurora, Cognito, S3 and DynamoDB.

**Prerequisites:** Python 3.12, Poetry 2.x, Node 20+, and Docker with the compose plugin.

```bash
# API
cd apps/api
cp .env.example .env
poetry install
make dev        # Postgres + moto, emulated pool/bucket/table, migrate, seed the demo tenant
make run        # http://localhost:8000/docs

# Web, in a second terminal
cd apps/web
cp .env.example .env.local
npm ci
npm run dev     # http://localhost:3000/de
```

Sign in as the seeded guest, or create an account. Locally, any six-digit code confirms an address.

**Running investigations** needs model access. Set these in `apps/api/.env`:

| Variable | Purpose | Required |
|---|---|---|
| `AWS_*` with Bedrock rights, `ZZ_REGION=eu-central-2` | Claude through Bedrock | yes |
| `ZZ_OPENAI_API_KEY` | red team and web research | no: the red team falls back to Claude Haiku, that research family is skipped |
| `ZZ_GEMINI_API_KEY` | second research family | no |
| `ZZ_GOOGLE_API_KEY` | Cloud Vision, Places, Street View | no |
| `ZZ_SERPAPI_API_KEY` | Google Lens | no |

With `ZZ_WORKER_ENABLED=true`, the API process also runs the worker. A missing optional key disables that tool only. Without Bedrock, uploads, batches and review still work, and a run fails at Perception with a named reason.

**From the command line**, the same pipeline runs without the web app:

```bash
cd apps/api
poetry run python -m zeitzeuge_api.investigation.cli run photo1.jpg photo2.jpg --label prio1
poetry run python -m zeitzeuge_api.investigation.cli export <batch-id> out.xlsx
poetry run python -m zeitzeuge_api.investigation.evaluate LABELS.xlsx out.xlsx   # score against checked labels
```

**Checks**, the same ones CI runs:

```bash
cd apps/api && make check              # ruff · mypy · pytest
cd apps/api && make test-integration   # + the RLS isolation suites on PostgreSQL
cd apps/web && npm run lint && npm run typecheck && npm test && npm run build
```

## Deploy to AWS

Everything is Terraform under `infra/`, in one environment, `prod`, in `eu-central-2`. The full procedure, with checks and costs, is in [`infra/docs/RUNBOOK.md`](infra/docs/RUNBOOK.md). Why Zurich is explained in [`infra/docs/region-decision.md`](infra/docs/region-decision.md).

```bash
export AWS_PROFILE=zeitzeuge
cd infra
make preflight            # region, Bedrock access, quotas, credit
make bootstrap            # once: state bucket and GitHub OIDC provider
make verify-iam           # prove the builder guardrails with the policy simulator
make plan && make apply   # a person reviews the plan and applies it
make db-role              # the RLS-bound application role, before the first migration
make github               # deploy role, network config and APP_URL into GitHub
infra/scripts/08-external-keys.sh   # public-tool keys into Secrets Manager
```

Then push to `main`. The deploy workflows build `linux/amd64` images, push `:<sha>` tags to ECR, and register pinned task revisions. They then run the migration and seed as one-off ECS tasks inside the VPC, roll the service and smoke-test through CloudFront. CI never runs `terraform apply`.

**Cost controls:** Aurora pauses to 0 ACU, there is one NAT gateway, budgets and a billing alarm run against the credit, and `make destroy` tears it all down after the event.

## Security and privacy

- **Data stays in Switzerland.** Compute, storage and Claude inference run in the AWS Zurich region through Bedrock EU profiles. The cross-family checks and the public tools are named and switchable.
- **No passwords in our database.** Credentials and MFA live in Cognito. Tokens are HttpOnly cookies set by server actions.
- **Isolation by the database.** RLS is forced on every tenant table and proved by a suite that runs as a non-superuser.
- **Least privilege.** Runtime roles never get `iam:*`. The deploy role cannot delete a bucket, a database or a table.
- **Bounded inputs.** Uploads use presigned, size- and type-bounded S3 tickets. Workbook imports are size-, ratio- and row-capped and parsed with defusedxml.
- **Everything is accounted for.** External calls are cached, rate-limited and costed. Human decisions are audited.

## Contributing

1. Branch from `main`. Pull requests run the CI for the paths they touch.
2. Run the same checks locally: `make check` in `apps/api`; lint, typecheck, test and build in `apps/web`.
3. Keep the invariants. A change that lets a model set a confidence, choose the next stage, or fill a field without cited evidence will not be merged.
4. Put user-facing text in `apps/web/messages/*.json`, in all three locales. The parity test will fail otherwise.
5. Ship a schema change as an Alembic migration together with its RLS policies, and an infrastructure change as Terraform with a reviewed plan.
6. Write the decision down: an ADR in `docs/architecture.md`, or a design note in `docs/superpowers/specs/`.

## Further reading

- [`docs/architecture.md`](docs/architecture.md): the full technical design and ADRs, marking what is built and what is designed
- [`docs/data-model.md`](docs/data-model.md): every table, contract, invariant and RLS policy
- [`docs/brief-review.md`](docs/brief-review.md): the challenge brief, requirement by requirement
- [`docs/superpowers/specs/`](docs/superpowers/specs/): design notes, with the measured failures that shaped them
- [`apps/api/README.md`](apps/api/README.md) · [`apps/web/README.md`](apps/web/README.md) · [`infra/README.md`](infra/README.md)

## Team

Built in 24 hours at **Zentral Hack 2026** (HSLU, Campus Zug-Rotkreuz) for the Staatsarchiv des Kantons Schwyz:

- **Roger Jeasy Bavibidila**, full-stack and AI engineering
- **Richard Thanikkal**, solution architecture

The Prio-1 photographs belong to the Staatsarchiv Schwyz and are used with its permission for this challenge. The historical prints on the public site are public-domain Photochrom prints from the Library of Congress; their attribution is in [`apps/web/public/archive/ATTRIBUTION.json`](apps/web/public/archive/ATTRIBUTION.json).
