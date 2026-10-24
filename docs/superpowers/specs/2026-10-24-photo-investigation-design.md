# Photo investigation P0 — from photo to a sourced Excel row

| | |
|---|---|
| **Date** | 2026-10-24, hack day 2, written at 01:45 · submission 17:00 |
| **Builds on** | [`brief-review.md`](../../brief-review.md) (BR-1, -2, -5, -6, -8, -10), [`data-model.md`](../../data-model.md) §6–8, §8.12, §14, §20, [`architecture.md`](../../architecture.md) §7.7, §8, §9.6–9.7, §10.2 |
| **Status** | Approved direction (Roger, 01:40): vertical slice, in-API worker, Step Functions stays roadmap. Builder check done; open questions answered (02:00) |

This note does not restate the contracts. Where the docs above define a table, a column, an enum, a rule or an endpoint, P0 builds **exactly that**, under the same name. This note says which subset is built tonight, where P0 knowingly departs from the architecture, and the decisions the docs leave open.

---

## 1. Intent

For each photograph the archivist uploads, ZEITZEUGE finds the five ranked place fields (Ortschaft → Gemeinde → Gebäude → See/Fluss/Berg → Strasse), backs each with cited evidence, computes each field's confidence **by a stated rule over that evidence**, leaves a field empty rather than guess, lets the archivist accept / correct / reject per field, and exports one Excel row per photo. This is what the brief requires (M2, M3, M6–M9) and what the jury judges.

**Success by 17:00**

1. SG.CIV.17.3 produces «Schwyz», «Schwyz», «Alterszentrum Acherhof», «Mythen», «Grundstrasse 32» (brief, `Kanton Schwyz Fotoerkennung.docx`). First regression test.
2. All 50 Prio-1 photos processed on the deployed stack; each row ends `maschinell · geprüft · korrigiert · offen`.
3. The workbook downloads from the app, with the «Methode» sheet explaining the rule.
4. The pitch headline is honest: *n correct, m flagged, k left open rather than guessed*.

**Anti-goals** (failure even if it "works"): a confidence a model made up; a field filled without a citation; a building or street name invented to fill a cell; a screen claiming more than is wired.

## 2. What is built (P0)

### 2.1 Data — the P0 subset of migrations 0002–0004 (data-model §20.1)

Same revision ids and table/column names as data-model §20.1, so later revisions **add** tables and columns, never rename. Every tenant table gets `ENABLE` + `FORCE` RLS and grants in the same file, the `0001` pattern; `test_rls.py` gains a case per table.

| Rev | P0 tables | Deferred to later revisions |
|---|---|---|
| `0002_holdings` | `fonds` (seed `foto21`), `upload_batches` (+`label`), `assets` (+`priority`, `external_ref`, `captured_at`, `exif_gps`, `exif_make`, `exif_model`, `exif_focal_mm`, `exif_hfov_deg`, `outside_canton`, `forensics`), `asset_files` | `fonds_stats`, `detected_series`, PostGIS/pgvector extensions (`exif_gps` stored as two numerics `exif_lat/exif_lon` if PostGIS is absent on the cluster — checked first) |
| `0003_investigation` | `runs`, `agent_invocations`, `run_events`, `evidence_items` (+`source_class` NOT NULL), `evidence_links`, `hypotheses`, `objections` | `terrain_tests`, `street_tests`, `horizon_curves`, `date_*`, `transcription_lines`, `text_findings`, `similar_items`, `steers`, `run_cache` |
| `0004_catalogue` | `field_definitions` (seed: the five ranked fields + `subject_point`, `camera_point`, `date`, with `priority_rank`, `excel_column`), `catalogue_records`, `record_versions` (+`formula_weights`), `record_fields` (+`raw_confidence`, `source_classes`, `corroborating_count`, `objection_count`), `record_field_evidence`, `field_reviews`, `exports`, `export_items`; the record_fields CHECKs of §8.5; trigger `trg_field_requires_evidence` (I-1) | `approvals` + `pending_tasks` (no task tokens in P0), `review_queue` (queue is a query in P0), `sensitivity_flags`, I-4/I-14 triggers |

Enums take the docs' full value lists (all 20 `agent_id`s, all 10 `source_class`es) even where P0 uses fewer, so no enum migration is needed later.

### 2.2 The investigation — `zeitzeuge_api/investigation/`

A package with a hard import boundary: it imports `db.models` and its own modules only, never `api/` or `services/`. That is what makes the later lift-out into `services/agents` (one Lambda per stage) a move, not a rewrite.

```
investigation/
  contracts.py     EvidenceItem, Hypothesis, Objection, FieldDecision (data-model §14.2–14.4) — Pydantic, I-1 validator
  confidence.py    the rule (§3) — pure, no I/O, no model
  ledger.py        writes invocations / evidence / hypotheses / objections / run_events in one transaction per stage
  models.py        Bedrock Converse client; task kinds → inference profile (the models.yaml idea, as a dict)
  tools/           swisstopo.py (SearchServer, identify, find), gwr.py (building addresses), osm.py (Overpass),
                   commons.py (Wikimedia Commons search + geosearch), wikipedia.py, stasz.py (Staatsarchiv catalogue)
  stages/          intake, perception, grounding, reference, hypothesise, check, adjudicate, produce
  pipeline.py      runs the stages in order over one run_id; resumes from the last committed stage
  worker.py        DB-backed queue: claims `runs` rows with FOR UPDATE SKIP LOCKED, concurrency 4
  cli.py           `python -m zeitzeuge_api.investigation.cli run <file|batch>` — same pipeline, in-process
```

**Stages → roster ids.** Ledger `agent_id`s are always roster ids (architecture memory rule); a stage may act as several:

| Stage | Roster ids | Model | Evidence classes it writes |
|---|---|---|---|
| Intake | `forensics` | — | `exif` (date, camera, focal → hfov). GPS only if the GPS IFD carries coordinates: 15 of the 50 have a GPS block holding only the version tag, 0 have coordinates |
| Perception | `scene`, `text-in-image`, `skyline` (description only, no geometry) | Claude Opus 5.5, EU profile, image input | `visual`, `text_in_image` — structured: visible text, building type and name candidates, landmarks, peaks, lake/river, streets, model-stated `strength` ∈ [0,1] capped at 0.8 |
| Grounding | `geo`, `heritage` (Building Identifier) | — (deterministic) | `geodata_layer`: SearchServer for each candidate name → identify Ortschaft (`ortschaftenverzeichnis_plz`), Gemeinde (swissBOUNDARIES3D, BFS-Nr), building address (`amtliches-gebaeudeadressverzeichnis` / GWR), named features (swissNAMES3D); OSM Overpass for named buildings by kind around the candidate locality |
| Reference search | `memory`, `research` | — | `reference_image` (Staatsarchiv SG.CIV Titel/Thema hits; Commons images with matching titles / geosearch near the candidate point), `open_web` (Wikipedia/Wikidata on candidate names; a commercial web-search API only if a key is present in `external/api-keys`) |
| Hypothesise | `synthesiser` | Claude Opus 5.5 | one hypothesis set per field family (`place`, `building`, `street`, `feature`), each hypothesis citing ledger `local_id`s only |
| Check | `redteam` | **different family**: OpenAI on Bedrock (`global.openai.*`, see D4); fallback Claude Sonnet 5.5, labelled same-family | `objections` with severity; the stage cannot add evidence, only object to it |
| Adjudicate | `adjudicator` | Claude Opus 5.5 | per field `{decision, value, evidence[], upheld_objections[], abstain_reason?}` — **no confidence**; the number comes from §3 |
| Produce | `cartographer` | — | `catalogue_records` + `record_versions` v1 + `record_fields` + `record_field_evidence`; run → `awaiting_review` |

Every invocation records `model_id`, `inference_profile`/region, tokens, cost and `input_sha256` (data-model §7.2). Tool calls are cached by request hash (DynamoDB `tool-cache` exists; P0 may cache in-process + S3 if that is quicker) so re-runs and the demo never depend on a live external API.

**Point → Fields** (architecture §7.7) is the backbone: once a candidate resolves to coordinates, Ortschaft, Gemeinde and the address are identify calls, each its own `geodata_layer` evidence item. The subject point and the camera point are kept apart and exported as labelled columns; P0 fills the subject point only (no camera pose without the falsifier) and leaves the camera columns empty — never invented.

### 2.3 API — the subset of architecture §10.2

| Method | Path | P0 behaviour |
|---|---|---|
| POST | `/api/v1/batches` | `{label, fonds_slug, mode}` → batch row |
| POST | `/api/v1/batches/{id}/assets` | per file `{filename, content_type, bytes, sha256}` → asset + `asset_files` rows + presigned POST to `originals` pinned to key, size, type, SSE-KMS (the avatar ticket pattern, `integrations/aws/s3.py`) |
| PUT | `/api/v1/assets/{id}/commit` | HEAD-verifies the object (avatar `verify_uploaded` pattern), asset → `uploaded`, enqueues a `runs` row |
| GET | `/api/v1/batches/{id}` | counts per run status + per-asset progress (current stage); live updates via `/batches/{id}/stream` (SSE, D8) |
| GET | `/api/v1/records/{id}` | `CaseFile` subset (data-model §14.5): asset preview URL, five fields with value, decision, confidence, rule explanation, evidence list with sources, objections, adjudicator reasoning |
| PATCH | `/api/v1/records/{id}/fields/{key}` | `{action: accept · correct · reject, value?, reason?}`, `If-Match: <version>` → new `record_versions` row (`actor_kind = human`), `field_reviews` row, `human` evidence item on correct (data-model §8.6) |
| GET | `/api/v1/batches/{id}/export?fmt=xlsx` | the workbook (§4), generated live from the head versions |
| GET | `/api/v1/eval/qc?batch=prio1` | `QcSummary` (data-model §14.10) |

### 2.4 Web — wire the existing screens, don't redesign them

- `/upload`: keep the ZIP reader and pairing; replace the simulated transfer with ticket → POST to S3 → commit, per file, with real progress.
- `/queue`: per-photo progress on real batch data; seeded demo rows only when the tenant has no batch (labelled as example data, per the simulate rule).
- `/records/[id]`: the existing editor on a real `CaseFile` — five fields, each with value, confidence, the rule's one-line reason, sources, objections, reasoning, or "bewusst leer gelassen" with its reason; accept / correct / reject per field.
- Export button on the batch view; Prio-1 QC panel (`maschinell · geprüft · korrigiert · offen` counts) on `/evaluation` and the dashboard counter.

### 2.5 Infra — one change, applied by Roger

`ecs-task-api.json`: allow `bedrock:InvokeModel`/`Converse` on EU inference profiles (`eu.*`, application profiles) and, for the check stage only, `global.openai.*` (D4); keep the guardrail statement shape from `lambda-agent.json`. Raise the API task to ≥ 1 vCPU / 2 GB if the worker shares it. Add env `ZZ_ORIGINALS_BUCKET`, `ZZ_MODEL_*`. The state machine and the agent module stay as they are.

## 3. The confidence rule (architecture §8.5, BR-6) — as implemented

Per field, over the evidence the adjudicator cited for the selected value:

1. Group supporting evidence by `source_class`; `s_c` = strongest item in class `c`. Ten hits from one website are one class.
2. `raw = 1 − Π_c (1 − w_c · s_c)` with the docs' default weights: exif 0.6 · visual 0.3 · text_in_image 0.5 · geodata_layer 0.7 · reference_image 0.6 · open_web 0.4 · terrain_geometry 0.9 · street_level 0.5 · archival 0.7 · human 0.95.
3. × `(1 − severity)` for each upheld, unresolved objection.
4. A refuting check (an upheld objection with severity 1, or any `refutes` evidence on the selected hypothesis) sets the field to 0 → `abstain (conflicting_evidence)`.
5. Decision: `raw ≥ 0.90` → `emit` («übernahmefähig»); `0.50 ≤ raw < 0.90` → `emit_with_review` («Prüfbedarf»); `< 0.50` or no supporting evidence → `abstain (insufficient_evidence)` — the value is **not** shown as a guess.
6. `Gesamtkonfidenz` = min over emitted ranked fields.
7. Reason string stored and exported next to every number: «3 Quellenarten bestätigen (Geodaten, Referenzbild, Schild im Bild) · 0 Einwände».

**Strength is not free-form.** Deterministic tools assign it by rule: exact official-register match 1.0, match after normalisation 0.85, fuzzy match 0.6, spatial-only (identify at a point) 0.9; a reference image with the same named object in its title 0.8; open web 0.6 per page. Model-stated strengths (visual, text) are capped at 0.8. So one model observation alone can never exceed 0.24 and can never reach «übernahmefähig».

The weights used are snapshotted into `record_versions.formula_weights`; `confidence.py` is pure and property-tested (monotone in evidence, bounded, one class counted once).

**Derived fields cite their chain (builder's call).** Ortschaft, Gemeinde and Strasse are resolved from a point. They cite the identify call that resolved them **and** the evidence that placed the point (the building's register match, the reference image, the model's recognition), because a wrong point makes them wrong too. Independence is still by class: an identify call and a register match are both `geodata_layer` and count once. An identify at a point placed by an exact register match gets strength 1.0. One that is only near a model-recognised name gets 0.9. Consequence, stated openly: without text in the image, a reference image or a human, most fields land at Prüfbedarf. That is the intended honest outcome, not a bug to tune away.

**The answer key is excluded (builder's call).** The 600 test photos are the series SG.CIV.17. The Staatsarchiv catalogue search excludes **the whole SG.CIV.17 series**, not only the photo's own signature. Neighbours from the same shoot would leak the answer just as well. All other SG.CIV series are fair reference material, which is what the brief asks for.

## 4. The workbook (data-model §8.12)

The §8.12 contract, unchanged: sheet **Ergebnisse** with the 35 columns in that order (every ranked field has its own `_Konfidenz` and `_Quellen`), **Belege** (= the «Quellen» sheet: one row per cited evidence item with URL), **Methode** (§3 in plain German, thresholds, column definitions), **Spalten** (column ↔ field ↔ ISAD(G)/scopeArchiv). One addition: a `Status` column after `Gesamtkonfidenz` with `übernahmefähig` (every emitted ranked field ≥ 0.90) / `Prüfbedarf` / `unbestimmt` (nothing emitted). It uses `unbestimmt`, not `offen`, so it cannot be confused with `QC_Status`. Rows for photos without a finished run are still written. `null` confidence is an empty cell, never 0.

**`QC_Status` precedence (builder's call)**, first match wins: `korrigiert` (any `edited`/`rejected`/`filled` review) → `geprüft` (every emitted ranked field `accepted_unchanged`) → `offen` (a human has touched the row but not finished it, **or** the run is not finished) → `maschinell` (finished run, no human touch, including rows with abstentions).

## 5. Departures from the architecture (deliberate, P0 only)

| # | Architecture says | P0 does | Why | Way back |
|---|---|---|---|---|
| D1 | Step Functions spine (ADR-01, §6.2) | In-API worker over a DB-backed queue; ASL untouched | Agents image, ASL rewrite and Data API client are four new failure points before 17:00 | Each stage is already a separate function with a fixed contract → one Lambda handler per stage |
| D2 | Ledger written through the RDS Data API as `zeitzeuge_pipeline` (§6.4) | API's asyncpg connection as `zeitzeuge_app`, same RLS policies, tenant set per transaction. Finding work across tenants under FORCE RLS goes through one narrow `SECURITY DEFINER` function `claim_next_run()`. It locks one queued run (`FOR UPDATE SKIP LOCKED`), marks it running and returns only `(run_id, org_id)`. Every read and write after that runs under that tenant's RLS | No second DB client tonight | `ledger.py` is the only writer; swap its transport |
| D3 | 20-agent roster, confidence-gated cascade (§5, §6.3) | 8 stages exercising 13 roster ids; one mode (`standard`) | Time | Roster ids already in the ledger; cascade is a Choice state later |
| D4 | Models only via EU profiles; red team = OpenAI (BR-4, §13.3) | OpenAI models exist on Bedrock only as `global.*` profiles, which leave the EU. The check stage uses `global.openai.*` under `research_tier = public_tools` (the brief clears the images for public tools); every such call is recorded with region `global`. All other stages stay EU. **Decided by Roger (02:00): OpenAI, and he edits the root-managed `ZeitzeugeBoundary` himself.** The boundary's `NeverRouteOutsideTheEU` Deny becomes a `NotResource` Deny that allows only `eu.*` profiles, application profiles, EU foundation models, `global.openai.*` and `openai.*` foundation models. That is stricter than today for `us.*`/`apac.*` | Cross-family red team (I-6) is impossible inside the EU on this account | `org_policies.research_tier` switch; `swiss_only` falls back to same-family, labelled |
| D9 | Staatsarchiv tenant, mirrored into the demo tenant (data-model §20.2) | **As specified (Roger, 02:00).** Upload, runs and QC happen in tenant `stasz`. A re-runnable `mirror_batch` job, run as a one-off ECS task like `seed`, copies the batch's assets, runs, ledger, records, versions, fields and reviews into the demo tenant with new ids. S3 objects are referenced, not copied. The guest (read-only) sees the mirror, labelled «Spiegel aus StASZ, Stand <time>». The seed creates org `stasz` and assigns the team's accounts to it as reviewers/admin | — | — |
| D5 | Terrain falsifier and street-level verifier (§7.1, §7.5) | Not built; hypotheses record terrain/street as `not_applicable` | Roadmap | The rule already has their classes and caps |
| D6 | Calibrated confidence via isotonic map on a gold set (§8.3) | `confidence = raw` (identity map); the Methode sheet says «nicht kalibriert» | No gold set by 17:00 | `calibration_maps` later; `raw_confidence` is already stored |
| D7 | `org_policies` holds weights and thresholds | Constants in `confidence.py`, snapshotted per version | `0007_governance` not built | Move constants to the table |
| D8 | WebSocket run stream (§10.4) | **Server-Sent Events** `GET /api/v1/batches/{id}/stream`: the ledger's `pg_notify('batch_<id>', …)` reaches one LISTEN connection per API task, which fans out to its open streams. Each event is re-read under the viewer's RLS, with a heartbeat every 15 s to stay under CloudFront's origin read timeout. The client falls back to polling every 15 s if the stream drops. | Updates only flow server → client. SSE is plain HTTP with the existing cookies, needs no upgrade handling at CloudFront/ALB, and costs one idle connection per viewer instead of 20 requests a minute. A room of phones behind one NAT would trip the WAF per-IP rate limit under 3 s polling | Same `run_events`/NOTIFY backbone the WebSocket design uses |

## 6. Testing

- **Unit (no network):** `confidence.py` (property tests), adjudication hard rules, EXIF parsing (incl. the empty-GPS-block case), Excel shape (35 columns, 4 sheets, empty row for an unfinished photo), RLS for every new table.
- **Stage tests on recorded fixtures:** tool responses and model outputs for SG.CIV.17.3 recorded once, replayed in CI.
- **Live regression, marker `live`:** SG.CIV.17.3 end to end against Bedrock and the real tools must yield the brief's five values. Run by hand and before the final run over the 50; not in CI.
- SG.CIV.17.3 shows **no text in the image**: «Alterszentrum Acherhof» has to come from model recognition + OSM/GWR + a reference or web hit. If the live test cannot reach it honestly, the field goes to Prüfbedarf or stays empty and we say so; we do not tune for one photo.

## 7. Build order (each step ends demoable)

1. Migrations 0002–0004 (P0 subset) + RLS tests.
2. `confidence.py` + contracts + the Excel exporter on an empty batch — the MUST exists from here on.
3. Intake → Perception → Grounding on SG.CIV.17.3 via `cli.py`, then Reference → Hypothesise → Check → Adjudicate → Produce; the live regression test.
4. Upload API + worker + infra change (Roger applies); deploy.
5. Web: upload, queue, record review, export, QC panel.
6. Run the 50 on prod in `stasz`; QC pass; `mirror_batch` into demo; final workbook.

## 8. Left to the builder

Prompt wording; Overpass query shapes; the Staatsarchiv catalogue access method (scopeArchiv Query has no documented API — if it cannot be queried politely and machine-readably, the stage records the source as unavailable and the pitch says so); exact Commons query strategy; whether the worker runs in the API task or as a second ECS service from the same image (the infra is the same).

## 9. Hardening deferred past 17:00

- **Composite tenant foreign keys.** Postgres FK checks bypass RLS, so a crafted insert could reference another tenant's row by UUID. P0 mitigates this in code: every write path (ledger, upload, review, mirror) only uses parent ids it has just read under the caller's RLS, and the ids are random UUIDv4s. The structural fix is `UNIQUE (org_id, id)` on each parent plus `FOREIGN KEY (org_id, x_id) REFERENCES parent (org_id, id)`, and per-tenant unique constraints. That goes in the first revision after the event (flagged by the automated security review of `0955e6d`).
