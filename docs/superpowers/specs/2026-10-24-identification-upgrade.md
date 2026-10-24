# Identification upgrade — from "confirm a guessed name" to "find, then prove"

| | |
|---|---|
| **Date** | 2026-10-24, hack day 2, written at 07:30 · submission 17:00 |
| **Builds on** | [`2026-10-24-photo-investigation-design.md`](2026-10-24-photo-investigation-design.md) (P0, as built at 03:00), [`architecture.md`](../../architecture.md) §5.2 #2/#9/#13, §5.6, §7.4–§7.7, §8.5, §12, §13.3, [`data-model.md`](../../data-model.md) §7 (`evidence_source_class`) |
| **Trigger** | The first full run of the 50 Prio-1 photos on prod (export `ZEITZEUGE_prio1_2026-10-24_0439.xlsx`) |
| **Status** | Approved direction (Roger, 07:20): build the upgrade, no plan document. Docs first, then code |

The P0 note stays the contract for everything this note does not change. Where this note changes a rule, a weight or a stage, the architecture and data-model sections listed above are amended in the same commit and point here.

---

## 1. What the first batch showed

| Measure (50 Prio-1 photos, run 03:02–04:37) | Value |
|---|---|
| Rows `übernahmefähig` | **0** |
| Rows `Prüfbedarf` / `unbestimmt` | 47 / 3 |
| Ortschaft / Gemeinde filled | 43 / 44 — almost all at 0.61–0.77 |
| Gebäude filled | 11 — highest 0.84 |
| See / Fluss / Berg filled | 16 |
| Strasse filled | **1** («Seeplatz 6», read off a sign) |
| Highest field confidence in the whole batch | 0.91 (one Ortschaft) |
| Time per photo | median 260 s, max 1178 s |

The models are not the bottleneck. Three structural causes are:

1. **The pipeline can confirm a name, but it cannot find one.** Perception is one vision call with no tools. Every later stage checks whether *the name the model guessed* exists in a register. «Schwyz exists in swissNAMES3D» is not evidence that this photograph shows Schwyz, yet it entered the ledger as `geodata_layer` evidence at strength 1.0 (weight 0.7). That circular item is why 40 rows sit at 0.70 ± 0.07 and why buildings and streets stay empty: nothing in the pipeline ever proposes a building the model did not already name.
2. **The rule could not reach 0.90 on most photos by construction.** Visual evidence is capped at 0.24, a register hit at 0.70, and the only class that adds an independent «this photo shows X» signal (a reference photo) was searched by name in two small corpora. Without a confirmed reference, no row could pass the acceptance line however right it was.
3. **Leaks between stages.** SG.CIV.17.58 reads «HOTEL DU LAC SEEHOF» on the façade and found the building, but Ortschaft and Gemeinde stayed empty because Point → Fields only ran from a reference-confirmed building. SG.CIV.17.378 — the Mythenhaus on the Grosser Mythen — came back fully empty. Two photos outside the canton (SG.CIV.17.411, .583) could not be answered at all: grounding drops every register hit outside a Schwyz bounding box, although the brief says «in Einzelfällen sind auch Orte ausserhalb des Kantons möglich».

### 1.1 What a tool-using model does on the same photos (probe, 06:40–07:10)

One GPT-5.5 call per photo through the Responses API with the `web_search` tool, image at 1568 px, no pipeline around it:

| Photo | P0 result | GPT-5.5 + web search | Notes |
|---|---|---|---|
| .378 | empty | Mythenhaus, Grosser Mythen, Schwyz | sources: grosser-mythen.ch |
| .159 | empty | Stoos-Seeli, Stoos, Morschach | |
| .58 | building only | Küssnacht, Seeplatz 6 | cites the canton's KSI inventory sheet |
| .5 | building only | Alpstubli, Stoos, Morschach, Ringstrasse 111 | |
| .207 | Gemeinde only | Kapelle St. Wendelin, Hoch-Ybrig, Unteriberg | |
| .139 | Goldau, Arth | Kapelle Maria Hilf, Stoos, Morschach | P0 answer probably **wrong** |
| .411 | empty | Flugplatz Buochs, Canton Nidwalden | outside SZ |
| .583 | Seealpsee | Berggasthaus Äscher, Appenzell Innerrhoden | outside SZ |
| **.3** | Schwyz, Mythen | **Spital Schwyz, Waldeggstrasse 10** | **wrong** — the brief's answer is «Alterszentrum Acherhof, Grundstrasse 32» |

Two conclusions, both load-bearing for the design:

- **Recall jumps** when a model can search: named buildings on 8 of 9 photos.
- **A searching model is confidently wrong in a way that looks sourced.** On .3 it found a real catalogue entry «Spital Schwyz (Krankenhaus), Waldeggstrasse: Rückseite» and a real hospital address, and stated 0.84. Every source was genuine; the inference from them was not. So a research model may **propose** a value and its sources, but it may never **settle** one. Settling needs evidence that ties *this photograph* to the name.

## 2. The principle: find, then prove

Every evidence item now answers one of three different questions, and only the third makes a field reliable:

| Question | Examples | Role |
|---|---|---|
| **Does the name exist, and where?** | SearchServer hit, OSM/KSI/Wikidata entry, Places Text Search result | Grounding: spelling, coordinates, a candidate. Weak support (§5) |
| **Who says this photo shows it?** | Perception, the two research agents | Candidate generation, cross-family agreement. Medium support |
| **What ties this photograph to it?** | A sign read in the image; the same picture on a page titled with the name (reverse image); a reference photo of the named object that matches; a Street View frame at its position that matches; geometry; a human | Identification. Strong support |

The confidence rule is re-weighted so that a field reaches «übernahmefähig» only when at least one identification witness agrees with the candidate (worked examples in §5.3).

## 3. The pipeline after the upgrade

Eleven stages. Perception, Sighting and Research have no dependency on each other and run concurrently; each commits its own ledger delta, so the live view still advances agent by agent.

```
Intake ─┬─ Perception (Claude)          ─┐
        ├─ Sighting (Vision + Lens)      ├─ Grounding ─ Reference ─ Resolve ─ Hypothesise ─ Check ─ Adjudicate ─ Produce
        └─ Research (GPT ∥ Gemini)      ─┘
```

| Stage | Roster ids | New / changed | What it adds to the ledger |
|---|---|---|---|
| Intake | `forensics` | — | `exif` |
| Perception | `scene`, `text-in-image`, `skyline` | prompt asks for the building type, signage and distinctive features in more detail | `visual`, `text_in_image` |
| **Sighting** | `text-in-image`, `research` | **new.** One Google Cloud Vision `images:annotate` call (`WEB_DETECTION`, `LANDMARK_DETECTION`, `TEXT_DETECTION`) and one SerpApi `google_lens` call per photo. A small model (Sonnet 4.6) extracts candidate proper names from page titles, best-guess labels and web entities; it cannot set a strength | `reverse_image` (§5.1) for pages carrying the same or a near-identical picture; `text_in_image` for OCR strings that a register confirms; landmark annotations with coordinates as `reverse_image` with a point |
| **Research** | `research` | **new.** Two independent model families with live web access: GPT-5.5 + `web_search` (OpenAI Responses API) and Gemini 4 Argon + `google_search` + `google_maps` (Gemini API). Same structured contract for both: per field a value, the source URLs, and up to four reference-image URLs | `open_research`, one item per family and value; its URLs are fetched by our code and the item is marked *verified* only if a fetched page contains the value (§5.1) |
| Grounding | `geo`, `heritage` | **changed.** Candidate names now come from Perception, Sighting and Research. Register name lookups become *existence* evidence (strength 0.35). **No canton filter**: SearchServer covers Switzerland; the canton is derived from the point. New registers: the canton's **KSI** inventory (1,110 protected buildings with name, EGID, coordinates and two photos per inventory sheet), the **Wikidata** gazetteer for Canton Schwyz (2,045 items with coordinates, 672 with an image), GWR building designations (`gbez`), and **Google Places** Text Search for named candidates and Nearby Search by type around the locality anchor for unnamed ones | `geodata_layer` (existence), building candidates with coordinates |
| Reference | `memory`, `streetlevel` | **changed.** Per candidate building, references from: Google Places Photos, KSI inventory photos, Wikidata `P18`, research-cited image URLs, Commons (title and geosearch), the Staatsarchiv catalogue (SG.CIV.17 still excluded). Plus up to two **Street View** frames at the candidate's position, heading from the nearest road. One Opus comparison per candidate, as before | `reference_image` for catalogue/Places/KSI/Commons/research photos; `street_level` for Street View frames |
| Resolve | `geo` | **changed.** The point comes from the strongest identifying witness: a confirmed building, a landmark annotation, a verified research claim with a Places/KSI/register position for the same value, a sign that a register places. Ortschaft, Gemeinde (with canton → `Ausserhalb_SZ`), GWR address at the point | `geodata_layer` (spatial) |
| Hypothesise | `synthesiser` | grouping also folds the research families' spellings onto the register's | hypotheses |
| Check | `redteam` | sees the verified source titles and the reverse-image page titles | objections |
| Adjudicate | `adjudicator` | — | decisions; the number is the rule's |
| Produce | `cartographer` | `Ausserhalb_SZ` filled from the point's canton | record, workbook |

### 3.1 Contract of a research agent (both families)

```json
{
  "fields": {
    "locality":          {"value": "Stoos", "sources": ["https://…"], "note": "…"},
    "municipality":      {"value": "Morschach", "sources": ["https://…"]},
    "building":          {"value": "Kapelle Maria Hilf", "sources": ["https://…"]},
    "landscape_feature": {"value": null},
    "street":            {"value": null}
  },
  "reference_images": [{"url": "https://…/kapelle.jpg", "shows": "Kapelle Maria Hilf"}],
  "outside_canton": false
}
```

`null` is a first-class answer. The prompt asks for «null rather than guess» and for a source per value. Neither family sees the other's answer (independence is the point of having two). The models compose their own search queries; that departs from ADR-11 («queries are templates») and is bounded instead by what happens after (D14).

### 3.2 URL verification (`page.verify`)

Every URL a research agent cites is fetched by our code, not trusted: `https` only, public hosts only (no private or link-local addresses after DNS resolution), 2 MB and 10 s limits, HTML reduced to text, treated as untrusted data. A claim is **verified** when at least one fetched page contains the value after folding (case, accents, «St./Sankt») — for a building, the page must also contain the locality or municipality. Unverified claims stay in the ledger at a low strength and say so in the Belege sheet. The fetched pages are cached with the tool cache, so a re-run and the demo do not depend on the live web.

## 4. New and changed tools

| Tool | Endpoint | Cost (Oct 2026 list) | Cache | Verified on this account |
|---|---|---|---|---|
| `vision.annotate` | `POST vision.googleapis.com/v1/images:annotate` — WEB_DETECTION, LANDMARK_DETECTION, TEXT_DETECTION | first 1,000 units/month free, then USD 3.50 / 1.50 / 1.50 per 1,000 | tool cache, forever (keyed by image SHA-256) | API enabled 07:15; **API key pending** (D10) |
| `lens.search` | `GET serpapi.com/search?engine=google_lens&type=all` on a short-lived presigned URL of the access copy | free plan, 250 searches/month | tool cache, forever | key works, 250 left (D11) |
| `research.openai` | `POST api.openai.com/v1/responses`, `gpt-5.5`, `tools: [web_search]`, reasoning effort medium | ≈ USD 0.4–0.6 per photo measured | tool cache, per image + prompt version | key works; 12 probe calls 06:40–07:10 |
| `research.gemini` | `POST generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:generateContent`, `tools: [google_search, google_maps]` | grounded requests: 5,000/month free, then USD 14 per 1,000 | as above | model listed on the key; **credit depleted** (D10) |
| `places.text` / `places.nearby` / `places.photo` | Places API (New) `places:searchText`, `places:searchNearby`, `{photo}/media` | Text/Nearby Pro: 5,000 free, then USD 32 per 1,000; Photos USD 7 per 1,000 | 30 days | API enabled; key pending |
| `streetview.static` | `maps.googleapis.com/maps/api/streetview` + free `metadata` | 10,000 free, then USD 7 per 1,000 | forever | API enabled; key pending |
| `ksi.near` / `ksi.search` | `map.geo.sz.ch/mapserv_proxy` WFS 2.0, layer `ms:ch.sz.a133a.kantonales_schutzinventar` (GML), inventory sheets `data.geo.sz.ch/public/Themen/A133a/<nr>.pdf` | free, open data | loaded once per process, sheets cached | 1,110 objects; sheet 01.001 parsed («Schwyz – Pfarrkirche St. Martin», EGID, coordinates, description) |
| `wikidata.sz` | `query.wikidata.org/sparql`, items with `P131+ wd:Q12433` and `P625`, optional `P18` | free | loaded once per process | 2,045 items, 672 with image |
| `gwr.designation` | `api3.geo.admin.ch/…/find?layer=ch.bfs.gebaeude_wohnungs_register&searchField=gbez` | free | 30 days | returns matches nationwide |
| `page.verify` | any `https` URL a research agent cited (§3.2) | — | 7 days | — |

Overpass stays, but is no longer on the critical path: the public endpoint returned 502 at capacity during research. KSI, Wikidata, GWR and Places cover the named buildings it was used for.

## 5. Evidence and the confidence rule

The formula is unchanged — `raw = 1 − Π_c (1 − w_c · s_c)` over distinct source classes, × `(1 − severity)` per upheld objection, 0 when refuted, thresholds 0.90 / 0.50. What changes is **which classes exist** and **how a strength is assigned**.

### 5.1 Source classes and strengths

Two classes are added (`ALTER TYPE evidence_source_class ADD VALUE`, migration `0006`):

| Class | Weight | Strength — assigned by rule, never by a model |
|---|---|---|
| **`reverse_image`** (new) | **0.8** | 0.95 a page with a *full* matching image whose title or URL contains the value · 0.8 a *partial* match page or a Lens exact match containing it · 0.5 only a visually similar image, a best-guess label or a web entity containing it · landmark annotation: `min(0.85, score)` |
| **`open_research`** (new) | **0.5** | per family: 0.6 when verified (§3.2), 0.3 when not. **Class strength by agreement:** both families name the same value and at least one is verified → 0.9; one family → its own strength; the families disagree → each value keeps its own strength and the red team is told |
| `geodata_layer` | 0.7 | **name lookup = existence only: 0.35** (was 1.0 exact / 0.85 normalised). Spatial identify at a point placed by an identifying witness: 0.9, or 1.0 when the point comes from a register entry for the same named object (unchanged) |
| `reference_image` | 0.6 | unchanged: `min(0.8, comparison confidence)` when «same» verdicts outnumber clear «different» ones; references now also from Places Photos, KSI sheets, Wikidata `P18` and research-cited images |
| `street_level` | 0.5 | `min(0.8, comparison confidence)` for a Street View frame judged to show the same object; a confident «different» is counter-evidence of strength 0.4, as for reference images |
| `text_in_image` | 0.5 | unchanged; a sign read by both Vision OCR and the vision model counts once, at the higher strength |
| `visual`, `open_web`, `exif`, `archival`, `terrain_geometry`, `human` | unchanged | unchanged |

**Independence, stated:** the research claim and the pages it cites are one item, not two (the pages are *why* the model made the claim; counting both would double-count). The pages are its `source_uri`s and appear in the Belege sheet. Wikipedia lookups made by our own code stay `open_web`, as before.

### 5.2 What the rule now refuses

- A name that only exists in a register: 0.7 × 0.35 = 0.25 on its own → abstain.
- A research claim alone, even from both families agreeing: 0.5 × 0.9 = 0.45 → abstain.
- Research agreement + existence + the vision model: 1 − (0.55 · 0.755 · 0.76) = 0.68 → Prüfbedarf.

### 5.3 What it now accepts (worked examples, all reachable without a human)

| Case | Classes | raw |
|---|---|---|
| Sign read + register places it + research agrees (SG.CIV.17.58 Gebäude) | text_in_image 0.5·0.8, geodata 0.7·1.0, open_research 0.5·0.9 | 1 − 0.6·0.3·0.55 = **0.90** |
| Reverse-image page names it + research agrees (a photo that exists online) | reverse_image 0.8·0.8, open_research 0.5·0.9, visual 0.3·0.8 | 1 − 0.36·0.55·0.76 = **0.85** → Prüfbedarf; with a matching reference photo (0.6·0.8) → **0.92** |
| Places photo matches + Street View matches + research agrees, nothing online (SG.CIV.17.3 Gebäude, target) | reference 0.6·0.8, street 0.5·0.8, open_research 0.5·0.9 | 1 − 0.52·0.6·0.55 = **0.83** → Prüfbedarf, honestly |
| Ortschaft resolved at a confirmed building + research agrees + vision model | geodata 0.7·0.9 (spatial), reference 0.6·0.8 (restated chain), open_research 0.5·0.9, visual 0.3·0.8 | 1 − 0.37·0.52·0.55·0.76 = **0.92** |

The Methode sheet prints the new table and these examples.

## 6. Measured, not only stated (QC pass → accuracy table)

The brief warns that «eine selbsteingeschätzte Konfidenz ist nicht automatisch eine objektiv gemessene Trefferquote». After the re-run, the team reviews the 50 rows in the existing review screen (accept / correct / reject per field). Every reviewed field becomes ground truth, and the export gains a measured table on the Methode sheet and on `/evaluation`:

- per field: filled / correct / wrong / left open, precision of filled values, precision at `übernahmefähig`, precision at `Prüfbedarf`;
- per confidence bin (0.5–0.6 … 0.9–1.0): number of fields and share correct — the reliability table the brief's 90 % line needs;
- P0 run (04:37 export) vs upgraded run on the same 50, same reviewers.

Labelled as what it is: 50 photos, reviewed by the team, not an independent gold set (architecture §17). SG.CIV.17.3 against the brief's five values stays the one external check.

## 7. Models

| Task | Binding | Why |
|---|---|---|
| perceive, compare, adjudicate | `eu.anthropic.claude-opus-4-6-v1` (unchanged) | Probed 07:25: Opus 5, Sonnet 5, Opus 4.7 and 4.8 return `AccessDeniedException` on this account; Opus 4.6 is the strongest Claude model it can invoke |
| research (A) | `gpt-5.5` + `web_search`, OpenAI API | Best measured recall in the probe; OpenAI is a headline sponsor and is named in the brief |
| research (B) | `gemini-4-argon` + `google_search` + `google_maps`, Gemini API | A second family with Google's index and Maps grounding; Bellingcat's Oct 2026 test ranks it with Claude at the top for geolocation |
| extract (names from reverse-image titles) | `eu.anthropic.claude-sonnet-4-6` | Mechanical extraction; cannot set a strength |
| challenge | OpenAI (unchanged) | I-6: a different family from the adjudicator and perception |

The red team shares a family with research agent A. That is acceptable because research is never the deciding class on its own (§5.2), and it is stated in the Methode sheet.

## 8. Departures (continuing the P0 note's D-numbers)

| # | Departure | Why | Fallback / way back |
|---|---|---|---|
| D10 | Two external dependencies were blocked at 07:30: the Gemini key's prepaid credit is depleted, and creating the Google Cloud API key needs Roger (auto mode refuses to mint credentials) | Account actions only Roger can take | Each tool checks for its key and records `skipped: <reason>` as a ledger note and in the row's Bemerkung. Research runs with one family; the agreement bonus is then unavailable and the Methode sheet says so |
| D11 | SerpApi on the free plan (250 searches): Google Lens runs for the Prio-1 set only; the further 550 photos use Vision WEB_DETECTION alone | Quota | A paid plan (USD 75 for 5,000) lifts it with no code change |
| D12 | No embedding index (pgvector / DINOv2) over the reference corpus in this round; references are fetched per candidate | Hours, not days | The `reference_images` table design (data-model §9.8) is unchanged; the per-candidate fetches are its future ingestion |
| D13 | Terrain falsifier still roadmap (P0 D5) | Unchanged | — |
| D14 | Research agents compose their own web queries (ADR-11 amended for this agent only) | Provider-side search tools do not accept templates | Bounded after the fact: model output is a candidate, never a value; every URL is fetched by our code under §3.2's rules; strengths are rule-based; the red team and the adjudicator see the verified pages |
| D15 | Image bytes leave AWS for Google (Vision, Lens, Gemini) and OpenAI (research, red team) | `research_tier = public_tools`, which the brief clears explicitly | `swiss_only` / `eu` tenants skip Sighting and Research; each call is logged with provider and region |

## 9. Cost and time per photo (expected, to be measured)

| Item | Per photo |
|---|---|
| GPT-5.5 research (≈ 50k in / 4k out tokens, ≈ 8 searches) | USD 0.40–0.60 |
| Gemini research (grounded) | USD 0.05–0.15 |
| Vision (3 features) + Lens | USD < 0.01 (free tiers) |
| Places (≈ 3 calls + 3 photos) + Street View (≤ 2) | USD < 0.15 after free tiers, 0 within them |
| Claude (existing stages) | unchanged, ≈ USD 0.30 |
| **Total** | **≈ USD 0.8–1.2**; 50 photos ≈ USD 50; 600 ≈ USD 600 at this setting, ≈ USD 250 with research at reasoning effort `low` |

Wall time: Research (≈ 30–90 s) overlaps Perception; the comparison stage adds ≤ 1 call per candidate with Street View frames attached to the same call. Expected median ≤ 5 min per photo; the worker runs 4 in parallel, so the 50 finish in ≈ 1 h.

## 10. Build order (each step ends runnable)

1. Migration `0006` (two enum values) + `confidence.py` weights/strengths + exporter Methode table + web labels for the two classes. Unit tests first.
2. Grounding fixes that need no new key: existence strength, no canton filter, `Ausserhalb_SZ` from the point, Resolve from any identifying witness (fixes .58).
3. Research stage with GPT-5.5 + `page.verify`; Gemini behind its key. Live check on .3, .58, .378, .159, .139.
4. KSI + Wikidata gazetteers; GWR designation search.
5. Sighting (Vision + Lens) and Places/Street View, as soon as the Google key exists.
6. Parallel Perception ∥ Sighting ∥ Research in `pipeline.py`; heartbeat unchanged.
7. Deploy (keys into `external/api-keys`), re-run the 50 in `stasz`, QC pass by the team, measured table (§6), mirror to demo.

## 11. Tests

- **Unit (no network):** the new strength rules and class weights (property tests: monotone, bounded, one class counted once, research agreement bonus only with a verified item); `page.verify` (folding, building needs locality, private-address refusal); KSI GML and inventory-sheet parsing on a recorded sample; the research contract's validation (null values, missing sources).
- **Stage tests on recorded fixtures:** research replies and fetched pages for .3 and .58 recorded once.
- **Live regression (`live` marker):** .3 must not emit «Spital Schwyz» as übernahmefähig; .58 must fill all of Ortschaft «Küssnacht», Gemeinde «Küssnacht», Gebäude, Strasse «Seeplatz 6»; .378 must name the Mythenhaus or leave the building open.
