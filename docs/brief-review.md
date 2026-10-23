# ZEITZEUGE — Review against the official brief (`description.md`)

| | |
|---|---|
| **Date** | 2026-10-23, hackathon day 1, ≈ 1.5 h into the build window |
| **Reviewed** | `PROPOSED_SOLUTION.md`, `docs/architecture.md` and `docs/data-model.md` as they stood before alignment (2026-10-23) |
| **Against** | `description.md` — the Kanton Schwyz challenge brief as published for the event (Ralph Ruch, Staatsarchiv) |
| **Ids** | `BR-n` = brief gap. Existing ids stay valid: `G1–G17` (architecture), `R1–R19` (data model) |
| **Status** | The three documents have since been aligned to this review (same day). The "today" columns below describe the state **before** alignment and are kept as the record of what changed. |

---

## 0. Verdict

**The architecture is strong enough to win on Innovation and Technische Umsetzung (50 % of the score). It is currently aimed at the wrong photographs and does not produce the one deliverable the brief makes mandatory.**

The proposal was written against the original challenge card, which was an empty skeleton. The brief that exists now is specific, and it changes four things the documents assume:

| The documents assume | The brief says |
|---|---|
| Historical photographs: glass plates, albumen prints, postcards, Kurrent on the back, dating 1850–1950 | **≈ 600 undescribed photos of recent date (21st century)**; 50 selected as Priority 1. "Historical" refers to the archive context and the reference holdings, not to the test images |
| Output = ISAD(G) CSV, EAD3, Dublin Core, IIIF, RiC-O, OAI-PMH | **Output = one Excel table, one row per photo**, with a unique link to the file, the metadata, a confidence value per row, and an understandable explanation of the scoring rule |
| One `place` field with a precision level | **Five ranked fields: Ortschaft → politische Gemeinde → Gebäude → See/Fluss/Berg → Strasse**, each ideally with its own confidence or a "needs review" flag |
| Swiss-only data path; no third-party model or research API outside AWS | The images are **cleared for public tools**; Claude, OpenAI, Google Maps, Google image search and public research are **explicitly named as allowed aids** |

None of this invalidates the thesis (P1–P3) or the adversarial pipeline. The terrain falsifier works at least as well on a 2015 phone photo as on an 1890 glass plate, and better once the EXIF focal length is known. But the roster, the field model, the exports, the gold set, the demo images and the pitch all need re-aiming. Section 4 is the list; section 7 is the re-ordered plan.

---

## 1. MUST requirements — compliance matrix

| # | MUST (verbatim, abridged) | Status | Where it stands today | Gap |
|---|---|---|---|---|
| M1 | Funktionsfähiger Prototyp (Tool/App/Makro) zur Analyse digitaler Fotografien | 🟡 designed | UI built on simulated data; identity API built; agents, falsifier, exporters not started (`architecture.md` §21.1) | Time risk only; see §7 |
| M2 | **Einlesen und Bearbeiten des Prio-1-Sets (50 Fotos); Ergebnisse bildweise erfassen** | 🔴 missing | Nothing in any document mentions the Prio-1 set, the 600-image delivery (Webtransfer), or a plan to run them. Demo data is 15 public-domain photochroms from the 1890s | **BR-1** |
| M3 | Merkmale erkennen/recherchieren und **nach Priorität Ortschaft → Gemeinde → Gebäude → See/Fluss/Berg → Strasse** aufbereiten | 🔴 partial | `field_definitions` has a single `place` field (`{label, bfs_nr, lv95, precision}`); `gazetteer_type` knows the types but the output contract collapses them into one value | **BR-2** |
| M4 | Konkrete geografische Zuordnungen, nicht allgemeine Objekttypen | ✅ | This is the thesis. P1 blocks "Gebäude" without a named, sourced claim | — |
| M5 | **Referenzquellen nutzen**: öffentlich erschlossene Archivbestände, Bildsammlungen anderer Institutionen, Geodaten, Recherchequellen | 🟡 partial | Federal geodata: yes. Staatsarchiv catalogue: "no scraping — export from the mentor" (§12). E-Pics (ETH): only as gold-set source, not as a retrieval corpus. Google Maps / image search: excluded by ADR-03 | **BR-3, BR-4** |
| M6 | **Pro Foto eine Zeile in einer Excel-Tabelle**, mit eindeutiger Zuordnung zur Bilddatei und den gefundenen Metadaten | 🔴 missing | `export_format` = `isad_csv · ead3 · dc_xml · iiif_manifest · rico_jsonld · xmp_jpeg`. No `xlsx` anywhere in the three documents or the code | **BR-5** |
| M7 | **Pro Bildzeile ein Konfidenzwert** und das **Bewertungsverfahren verständlich erklären** | 🟡 partial | Per-field calibrated confidence exists and is better than asked. But: no row-level value in the export; the method is "isotonic map fitted on a gold set" with no human-readable rule; the planned gold set (ETH historical photos) is a different distribution from the test set | **BR-6, BR-7** |
| M8 | Unklare Merkmale transparent kennzeichnen statt erfinden | ✅ | `abstain` with closed reasons, `emit_with_review`, invariant I-1 enforced three times. Strongest part of the design | — |
| M9 | **Qualitätskontrolle** und **Live-Demo** an konkreten Fotos: wie Zuordnung, Unsicherheit und Excel-Ausgabe zustande kommen | 🟡 partial | Agent Theater + Case File show the "how". No defined QC pass over the 50; no Excel to show | **BR-8** |

Three of nine MUSTs are unmet and three more are partial. Every one of them is cheap relative to what is already designed; they are missing because the brief did not exist when the design was made.

## 2. SHOULD requirements

| # | SHOULD | Status | Note |
|---|---|---|---|
| S1 | Beyond the 50, describe more of the ≈ 600 | ✅ design | Bulk Distributed Map (J2), after G8/G9 fixes. 600 × standard mode ≈ USD 30–50 |
| S2 | Difficult building / street / address assignments improved by **extra research steps** | 🟡 | The deep pass escalates to Opus + terrain. It has no street-level or building-level tools (Street View, Mapillary, OSM, GWR addresses, Places) — **BR-9** |
| S3 | Compare several image and text sources automatically; **document the most important sources per result** | ✅ design | The ledger does exactly this (`source`, `source_uri` per evidence). Must surface in the Excel — BR-5 |
| S4 | Separate confidence per field or a "Prüfbedarf" flag | ✅ design | `confidence` per `record_field`; `emit_with_review` = Prüfbedarf. Must surface in the Excel |
| S5 | Semi-automatic review for archivists | ✅ built (simulated) | Case File editor + triage queue |
| S6 | UI with preview, metadata, source evidence, **geographic visualisation** | 🟡 | Map pane is P1; MapLibre is not in `package.json` (§11.5). For a 21st-century set the map is the most-looked-at pane — promote to P0-lite |
| S7 | **Systematically index already-described reference images** (embeddings, OCR, retrieval, map matching) | 🟡 | Collection memory indexes the tenant's own assets. The brief wants the *reference* holdings indexed (SG.CIV, E-Pics) — **BR-3** |
| S8 | Adapt the Excel export to a later-defined AIS import format | ✅ design | `field_definitions` makes the mapping data, not code. Add an `excel_column` mapping — BR-5 |

## 3. The dataset shift and what it does to the roster

"Rund 600 bisher unerschlossene Fotos neueren Datums (21. Jahrhundert)" changes the evidence landscape:

- **EXIF is now a primary witness.** `DateTimeOriginal`, possibly GPS, camera model, focal length. The documents treat EXIF as "facts" in a JSON column (`assets.forensics`, `asset_files.exif`). It should produce *hypotheses* and *evidence*: an EXIF GPS point is a place hypothesis with origin `exif` that still goes through the falsifier (phones get GPS wrong indoors and under cliffs). Focal length + sensor size gives the falsifier its horizontal field of view, which removes one of the three unknowns in the horizon match. **Check the EXIF of all 600 in the first hour — if GPS is present on a large share, the night looks completely different.** (**BR-10**)
- **The chronology machinery loses most of its weight.** The period grid is 1850–1980 and `date_estimates.window` is hard-coded 1860–1950 (`data-model.md` §7.9). For a 2008 photo the date comes from EXIF. The map time-travel tool keeps one valuable job the brief names explicitly: "Einige Gebäude existieren heute möglicherweise nicht mehr" — swisstopo's yearly orthophoto series and the Zeitreihe maps can confirm a building existed at the EXIF date even if it is gone from today's Street View. Retarget, don't delete. (**BR-11**)
- **Verso and materiality are usually not applicable.** Born-digital files have no verso and no photographic process. Both agents already have a `not_applicable` path; make it automatic (no verso file ⇒ skip; file is JPEG with EXIF `Make` ⇒ materiality skip) and spend no demo time on them.
- **Text-in-image gains weight.** Modern photos carry shop signs, street plates, event banners, bus destinations, and licence plates. The first four are the cheapest route to a named building or street; the last is PII (Sensitivity Guard).
- **Sensitivity matters more, not less.** Living people, children, plates. The brief says the images are datenschutzrechtlich unbedenklich; flagging them anyway is a credibility point with Kantons-IT.
- **The demo images are wrong.** All 15 seeded photos are 1880s–1940s. The hero on the landing page is an 1890s photochrom. Ralph Ruch will judge on *his* 50. The demo tenant must contain the real Prio-1 set, processed. (**BR-12**)

### Roster, re-aimed (nothing is deleted; "park" = runs, returns `not_applicable`, not demoed)

| # | Agent | For a 21st-century set | Action |
|---|---|---|---|
| 0 | Forensics | EXIF date, GPS, camera, focal → hfov; pHash duplicates within the 600 (shoots are likely) | **Elevate**: emit `exif` hypotheses and evidence, compute `hfov_deg` |
| 1 | Scene Analyst | unchanged | keep |
| 2 | Built-Heritage | Reframe as **Building Identifier**: GWR/EGID at a point, OSM named features (`Alterszentrum Acherhof` is in OSM, not in KGS), Wikidata, Google Places | retarget tools |
| 3 | Materiality | n/a for born-digital | park (auto) |
| 4 | Verso & Paleography | n/a without a verso file | park (auto) |
| 5 | Text-in-Image | signs, plates, banners → named entities; licence plates → PII flag | **promote to P0** |
| 6 | Skyline Extractor | unchanged; tighter with known hfov | keep |
| 7 | Geo-Grounding | Add the layers that answer the five priority fields directly (see BR-2) | extend tools |
| 8 | Collection Memory | Retarget as **Reference Retrieval** over SG.CIV, E-Pics, Commons, Smapshot *and* the 600 themselves (series detection) | extend (BR-3) |
| 9 | Chronology | EXIF date first; period tools re-pointed at 2000–2026 (orthophoto series, Zeitreihe) for "did this building exist then" | retarget, lower priority |
| 10 | Hypothesis Synthesiser | hypothesis kinds `building`, `street`, `feature` in addition to `place` | extend |
| 11 | Terrain Falsifier | unchanged — still the hero; covers the landscape share | keep |
| **new** | **Street-Level Verifier** | For the share without a horizon (village streets, buildings): fetch the view at the hypothesised pose from Street View Static / Mapillary / swisstopo 3D and have a VLM judge the match, red-teamed. The urban analogue of the falsifier; weaker (a model judges, not geometry) and labelled as such | add, P1 (**BR-9**) |
| **new** | **Open Research** | Reverse image search (Google Lens via a search API, Commons similarity) + web search on candidate names ("Acherhof Schwyz") → `external` evidence with `source_uri`. The brief names exactly these tools | add, P0-lite (**BR-4**) |
| 12 | Red-Team Verifier | Bind to an OpenAI model: headline sponsor, explicitly named by Ralph, and a different family. `gpt-oss` on Bedrock as the in-AWS fallback | re-bind |
| 13 | Adjudicator | Chooses value and decision; **the confidence number comes from a formula over the ledger, not from the model** (BR-6) | change |
| 14 | Metadata Cartographer | Add the Excel mapping | extend (BR-5) |
| 15 | Multilingual & A11y | Low value for this brief | park |
| 16 | Sensitivity Guard | More relevant: people, children, plates | keep, P0 |
| 17 | Curator-Feedback | QC corrections → eval cases | keep |

The roster becomes 20. `AGENT_COUNT` is derived from `agents.ts`, so the UI follows; the pitch must say 20 (R12 again).

---

## 4. Findings and fixes (BR ids)

### BR-1 · The Prio-1 set is not in the plan — P0
Nothing ingests, tags or reports on the 50. Add `assets.priority smallint` (1 = Prio-1) and `assets.external_ref` (the delivered filename, unique within the batch — the "eindeutige Zuordnung zur Bilddatei"), an `upload_batches.label`, a fonds "Fotobestand 21. Jh. (unerschlossen)" in the Staatsarchiv tenant, and a dashboard counter "Prio-1: n/50 bearbeitet · m geprüft". The first hour of the build is: get the files, run `exiftool -csv` over all 600, and look at the result.

### BR-2 · One `place` field cannot express five ranked fields — P0
The brief's five fields are different *kinds* of answer with different sources and different confidences. Model them as separate catalogue fields in `field_definitions`, each with `priority_rank` and `excel_column`:

| key | Brief term | Resolved from | Typed value |
|---|---|---|---|
| `locality` | Ortschaft | `ch.swisstopo-vd.ortschaftenverzeichnis_plz` identify at the subject point; gazetteer | `{name, plz, lv95}` |
| `municipality` | politische Gemeinde | `swissBOUNDARIES3D` Gemeinde identify | `{name, bfs_nr}` |
| `building` | Gebäude | GWR (EGID) + OSM/Wikidata/Places name, text-in-image, reference image | `{name, egid?, address?, wikidata_qid?, lv95}` |
| `landscape_feature` | See / Fluss / Berg | swissNAMES3D + terrain test summits + lake/river polygons in view | `[{name, kind, lv95}]` |
| `street` | Strasse | `ch.swisstopo.amtliches-strassenverzeichnis`, GWR address, street plates, Street View | `{name, plz_ortschaft}` |

Keep `place` as the composite access point for ISAD(G)/DC exports; derive it from the five. Two coordinates matter and must not be confused: the **subject point** (what the photo shows — what the archive catalogues) and the **camera point** (where it was taken, from the falsifier or EXIF). Export both, labelled.

A deterministic **Point → Fields resolver** falls out of this: once any witness (terrain match, EXIF GPS, reference match, street-level match) fixes a point, Ortschaft, Gemeinde and nearest named building/street are *identify* calls with a citable layer as evidence. The priority chain then costs nothing extra and each field cites a federal layer.

Data-model deltas: `hypothesis_kind` + `building · street · feature`; `hypothesis_origin` + `exif · reference_match`; `record_fields` unchanged (one row per field per version already works).

### BR-3 · The reference holdings are not a retrieval corpus — P0 for Commons, P1 for the rest
The brief points at the Staatsarchiv's own SG.CIV fonds (with Titel/Thema fields that carry place names), E-Pics, and "weitere Bildersammlungen". Build one global table `reference_images` (`source ∈ stasz_sgciv · epics · commons · smapshot`, external id, title, thema, place text, `geom`, licence, thumbnail key, image + text embedding) and let agent #8 query it. What is realistic tonight:

- **Wikimedia Commons, geotagged photos of Canton Schwyz** (API `geosearch` + category walk): thousands of CC images with coordinates — modern, the same distribution as the test set, licence-clean. This is both the reference corpus and **the gold set** (BR-7). Highest value per hour.
- **SG.CIV catalogue entries**: Titel + Thema + thumbnail where the public catalogue serves one. Ask Ralph for an export first; if the "Link zur Bilddatenbank" in the challenge documents is a public image database, a slow, identified, cached fetch is within the brief's own instruction to use it.
- **E-Pics**: ask for API access; otherwise the ETH Bildarchiv's Commons uploads cover the Schwyz municipalities.

### BR-4 · ADR-03 excludes tools the sponsor explicitly allows — P0 (policy), P1 (tools)
The architecture reaches models only through Bedrock in the EU and nothing else. The brief: the images "dürfen mit öffentlichen Tools bearbeitet werden", and Ralph names Claude, OpenAI, Google Maps and Google image search. Don't drop residency; **make it a policy**. Add `org_policies.research_tier ∈ {swiss_only, eu, public_tools}`; the router and the tool library consult it; every call under `public_tools` is logged in `cost_ledger` and in the field's provenance (`models`, `source_uri`). The Staatsarchiv tenant runs `public_tools` because its brief says so; the `/admin` screen shows the switch. That turns a conflict into a governance feature Kantons-IT can see, and it unlocks: OpenAI as the red team (sponsor), Google Places / Geocoding / Street View Static, a reverse-image search API, and Claude's own web search for the research agent.

### BR-5 · No Excel export — P0, the single most important fix
Add `xlsx` to `export_format`, `batch` to `export_scope`, an exporter `services/exporters/xlsx.py` (openpyxl), and `field_definitions.excel_column`. One workbook, four sheets:

1. **Ergebnisse** — one row per photo. Columns (German, since the archive reads it): `Dateiname · Datei_SHA256 · Signatur · Prio · Ortschaft · Ortschaft_Konfidenz · Ortschaft_Quellen · Gemeinde · Gemeinde_BFS · Gemeinde_Konfidenz · Gemeinde_Quellen · Gebaeude · Gebaeude_Konfidenz · Gebaeude_Quellen · See_Fluss_Berg · …_Konfidenz · …_Quellen · Strasse · …_Konfidenz · …_Quellen · Motiv_LV95_E · Motiv_LV95_N · Aufnahmestandort_LV95_E · Aufnahmestandort_LV95_N · Aufnahmerichtung · Aufnahmedatum_EXIF · Ausserhalb_SZ · Gesamtkonfidenz · Pruefbedarf · Unbestimmt · QC_Status · QC_Von · Bemerkung · Run_ID · Erzeugt_am`.
2. **Belege** — one row per evidence item cited by an emitted field: `Dateiname · Feld · Quellenart · Quelle · URL · Beobachtung · Staerke · Agent · Modell`.
3. **Methode** — the scoring rule in plain German (BR-6), the thresholds used, the definition of each column, and the sentence "Konfidenz ≥ 0.90 = übernahmefähig; darunter Prüfbedarf" (the brief's 90 % note, applied to our scale).
4. **Spalten** — the column ↔ field ↔ ISAD(G)/scopeArchiv mapping, so S8 ("an ein später festgelegtes Importformat anpassen") is a config change.

`Gesamtkonfidenz` = min over emitted priority fields (this is `runs.outcome_confidence` already). `Unbestimmt` lists abstained fields with their reason — the brief's "transparent kennzeichnen" in the file itself. The exporter must work at hour 3 with empty confidences; the deliverable exists before the agents do.

### BR-6 · The confidence must follow a stated rule, not a model's feeling — P0
Today: the Opus adjudicator "assigns calibrated confidence", then an isotonic map corrects it. A judge who asks "nach welcher Regel?" gets "the model says, then we adjust". Replace the first step with a **deterministic formula over the ledger** that the Methode sheet can print:

- Per field, take the corroborating evidence items grouped by **independent source class** (`exif · visual · text_in_image · geodata_layer · reference_image · open_web · terrain_geometry · street_level · human`). Ten hits from one website are one class.
- `raw = 1 − Π_classes (1 − w_class · max_strength_in_class)` (noisy-OR), then multiply by `(1 − severity)` for each upheld, unresolved objection; a `refuted` terrain test sets the place-family fields to 0 (already a DB CHECK); `inconclusive` caps at 0.6.
- `confidence = calibration_map(raw)` fitted on the gold set (BR-7), with ECE reported.

Store the inputs on the field (`record_fields.source_classes varchar[]`, `corroborating_count`, `objection_count`) so the Excel can say "3 Quellenarten bestätigen (Geodaten, Referenzbild, Schild im Bild), 0 Einwände" next to the number. This is Ralph's "zehn Quellen = 100 %" made rigorous, and it is reproducible without a model call. The adjudicator keeps the judgment that needs a model: which value, emit or abstain, which objections are upheld.

### BR-7 · The gold set is the wrong distribution — P0
ETH-Bibliothek historical photos (the planned gold set) would calibrate a system that is then tested on 21st-century colour photos. Replace with **Commons geotagged photos of Schwyz municipalities** (BR-3): ground-truth coordinates ⇒ Ortschaft and Gemeinde by identify, often the building by title. 150 cases, 20 % held out, strata `landscape · village · building · street · interior · outside_sz`. Eval metrics retarget to the brief: accuracy per priority field, coverage per field, abstention precision, "Prüfbedarf precision" (how often a flagged field was actually wrong), hallucination rate, ECE. Dating MAE and bracket hit rate are no longer headline numbers.

### BR-8 · QC is undefined — P0
"Ergebnisse einer Qualitätskontrolle unterziehen" needs a visible procedure, not just an editor. Define: every Prio-1 row ends the night in one of `maschinell · geprüft (bestätigt) · korrigiert · offen`; derive it from `record_status` + `field_reviews` + `approvals` (no new column). Plan a team QC pass over all 50 in the Case File around T+15 h (§7); each correction becomes an eval case via the curator (M5). The `/evaluation` screen gets a "Prio-1 QC" panel: 50 rows, how many confirmed, corrected, open, and the override rate per field. That panel is the honest headline number for the pitch.

### BR-9 · No verification path for the non-landscape share — P1
The terrain falsifier is eligible for perhaps 30–50 % of a landscape-heavy set and less for a modern municipal photo set (buildings, streets, events). The brief's SHOULD asks for "zusätzliche Rechercheschritte" exactly here. The Street-Level Verifier (roster above) is the answer: Street View Static API or Mapillary image at the hypothesised pose and bearing, a VLM comparison, red-teamed, recorded as `pose_tests` rows (generalise `terrain_tests` with `method ∈ terrain_geometry · street_level`). Lower weight than geometry in BR-6 and labelled "VLM-judged" in the UI and the Excel.

### BR-10 · EXIF is a column, not a witness — P0
See §3. Add `assets.captured_at`, `assets.exif_gps geography`, `assets.exif_focal_mm`, `assets.exif_hfov_deg` (computed from focal and the camera's sensor width, with a lookup table for common models). Forensics emits an `exif` hypothesis for GPS and an `external` evidence item for the date. The falsifier reads `exif_hfov_deg` when present and reports the tighter accuracy.

### BR-11 · Chronology is hard-wired to 1850–1980 — P1
`date_estimates.window_from/to` (1860–1950), the period grid (1850–1980) and `period_events` are all pre-1980. Make the window `[captured_at − 1, captured_at + 1]` when EXIF exists, else 1990–2026 for this fonds; add period events of kind `building_demolished` / `building_built` for 2000–2026 where known; point `maps.timetravel` at the swissimage yearly series. The agent's new question is "existed this at the EXIF date, and does it still?".

### BR-12 · Demo data, hero image and pitch tell a different story than the brief — P0 for the pitch
The pitch opens on a Bettschart glass plate and closes on the 1937 Sihlsee. Ralph Ruch's problem is 600 recent photos with no place name. Rewrite the beats on a Prio-1 photo: *"Dieses Foto kam ohne jede Angabe. ZEITZEUGE sagt: Brunnen, Gemeinde Ingenbohl, Hotel X, Vierwaldstättersee — mit drei unabhängigen Belegen, Konfidenz 0.91; Strasse: unbestimmt, Prüfbedarf. Und hier ist die Excel-Zeile."* Keep the terrain overlay as the wow moment (a modern lakeside photo with a visible ridge is ideal), keep the red team killing a hypothesis, and name the comparison the brief hands you: *Archipanion erkennt "Gebäude"; wir nennen das Gebäude — oder sagen, dass wir es nicht können.* The landing hero can stay historical as brand; the demo tenant must be the real set.

### BR-13 · Delivery order puts the MUSTs last — P0
The build order in `architecture.md` §21.2 reaches exports at hour 15–18 and never reaches the 50 photos. The brief is judged on M2, M6, M7, M9. §7 below re-orders without shrinking the architecture: the full roster stays the architecture slide; the P0 demo is the subset that processes the real 50 into a real Excel with a stated rule.

### Smaller items
- **BR-14** `eval_stratum`, `eval_source` enums: add the strata and `commons_geotagged` (BR-7).
- **BR-15** The brief lists the prize as CHF 1'000 only; the proposal's 2nd/3rd prizes came from the sibling card. Fix the title block.
- **BR-16** Team size is 3–4 (confirmed in the brief); the proposal's team-shape table assumes four roles. If you are three, fold "Data, eval & infra" into "Agents" and give the Excel + QC + pitch to whoever owns the frontend.
- **BR-17** "Die tatsächlich verfügbaren KI-API-Zugänge … sind durch die HSLU zu klären": HSLU may hand out OpenAI keys. Ask; it makes the sponsor red team free.
- **BR-18** Map pane (S6) needs MapLibre + swisstopo WMTS in `package.json`; a static map image per record is the fallback that still satisfies "geografische Visualisierung".
- **BR-19** Licence plates and faces in modern photos: the Sensitivity Guard's `pii` policy should cover plates (Rekognition `DetectText` or the text-in-image agent flags the pattern).

---

## 5. What is right and must not be touched

These are the parts a competitor cannot copy in 21 hours, and they map directly to the two 25 % criteria:

- **P1 enforced three times** (Pydantic, deferred trigger, CI property test). "Hallucination rate 0 % is structural" is still the best slide in the room.
- **A non-LLM component that can veto an LLM** (terrain falsifier) and a **different-family red team**. Both are more relevant with EXIF GPS in play: "even when the camera says where it was, we check against the Alps".
- **Calibrated abstention as a product feature** — this is the brief's "nicht mit scheinbar präzisen Angaben befüllen" verbatim.
- **Step Functions spine, references-not-payloads, untrusted-data blocks** — the governance story.
- **Per-field provenance, machine vs human forever, only humans approve, immutable versions** — the archive story.
- **Partial re-execution on steering** — the "Regenerate done properly" demo beat still works, and the steer example becomes *"Das ist in Brunnen, nicht in Gersau"*.
- **Multi-tenant RLS, Cognito, OAI-PMH, IIIF, RiC-O** — keep as architecture and roadmap. The brief declares a "vollständig produktionsreifes Archivsystem" out of scope, so none of these may consume a build hour before M2/M6 are met.

---

## 6. Rubric exposure after the fixes

| Criterion | Weight | Today | After BR-1…13 | Why |
|---|---|---|---|---|
| Innovation & Kreativität | 25 % | strong | strong | Falsifier, cross-family red team, calibrated silence, steer re-run; plus EXIF-vs-Alps and the street-level analogue |
| Technische Umsetzung | 25 % | strong on paper, 🔲 in code | strong if the vertical slice runs on real photos by T+7 h | The invariant in code, the spine, the router, the ledger |
| Problemlösung & Relevanz | 20 % | **at risk** | strong | The 50 processed, the Excel, the five fields, the stated rule, QC — all judged by the person who wrote the brief |
| Präsentation & Pitch | 15 % | aimed at the wrong photos | strong | Demo on Prio-1 images; Archipanion contrast; the Excel on screen |
| Business-Potenzial | 15 % | good | good | 600 images for ≈ USD 50; 26 cantons; `research_tier` policy makes it sellable to both the cautious and the pragmatic |

---

## 7. Re-ordered delivery for the remaining window (T = now, ≈ 20 h to 17:00)

Each step ends with something a judge could see. Parked items are listed at the end, not deleted.

| T + h | Deliverable | Owner | Closes |
|---|---|---|---|
| 0–1 | **Get the images** (Webtransfer / Bilddatenbank link). `exiftool -csv` over all 600: share with GPS, date range, cameras. Message Ralph with §8. Repo created, Terraform applied with image gates (parallel) | all / infra | BR-1, BR-10 |
| 1–3 | Migrations 0002–0004 with the five priority fields, `assets.priority/external_ref/exif_*`; Prio-1 batch ingested; **`xlsx` exporter produces a 50-row workbook from the DB** (confidences empty). The MUST exists | data | BR-2, BR-5 |
| 3–7 | **Vertical slice on real Prio-1 photos**: intake (EXIF) → scene + text-in-image + geo (identify layers, Point → Fields) + open research → adjudicate (formula) → produce → Excel row. Theater on real events. Run all 50 in standard mode | agents + frontend | BR-4, BR-6, M1–M3 |
| 7–10 | Reference corpus + gold set from Commons geotagged Schwyz photos; pgvector kNN → `reference_image` evidence class; baseline A measured | data / eval | BR-3, BR-7 |
| 10–13 | ⭐ Terrain falsifier with EXIF hfov; cached-horizon fallback; overlay in the Case File; map pane | geo / CV | hero, BR-18 |
| 13–15 | Synthesiser, OpenAI red team, invariant trigger live, calibration map fitted; street-level verifier if the slice is stable | agents | BR-9 |
| 15–17 | **QC pass**: the team reviews all 50 in the Case File; corrections → eval cases; **final Excel v1**; QC panel on `/evaluation` | all | BR-8, M9 |
| 17–19 | Methode sheet, ablation on the held-out Commons set, pitch on Prio-1 photos, golden run recorded | eval + pitch | BR-12 |
| 19–20 | Feature freeze, submission, buffer | all | — |

**Parked for this window** (architecture slide, not code): chronology tool pack beyond EXIF, verso dual-read, materiality classifier, multilingual, OAI-PMH, RiC-O, IIIF tiles (serve the access JPEG), public assist live, per-tenant CMKs, OpenSearch.

---

## 8. Questions for Ralph Ruch (first contact, tonight)

1. Where is the Bilddatenbank / Webtransfer link, and is there a list naming the 50 Prio-1 files?
2. Do the files carry EXIF, and may we rely on EXIF GPS where present? (We will check, but his answer tells us whether the archive stripped it.)
3. Which Excel columns would make the later scopeArchiv import easiest, and is there a "Thema" vocabulary we should map place names to?
4. May we fetch SG.CIV titles and thumbnails from the public catalogue for a reference index, or can he export them?
5. Confirmation for the record that public tools (OpenAI, Google Maps / Street View / image search) may process the images, as the brief states.
6. What did the attempt two years ago do, and what made it unconvincing? (Archipanion?) — so the pitch answers it directly.
7. Will HSLU provide API keys (OpenAI is a sponsor), and are there usage limits we should plan around?

---

## 9. Bottom line for the two of you

Keep the architecture. Re-aim it in this order: **images in → five fields → Excel out → stated confidence rule → run the 50 → QC → pitch on their photos.** Everything that made the design strong (evidence invariant, falsifier, red team, abstention, provenance) survives untouched and becomes more convincing on a dataset where the camera itself is a witness that can be wrong.
