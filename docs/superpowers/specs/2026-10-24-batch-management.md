# Batch management — filter, withdraw, restore, bulk actions

| | |
|---|---|
| **Date** | 2026-10-24, hack day 2, 05:30 |
| **Builds on** | [`2026-10-24-photo-investigation-design.md`](./2026-10-24-photo-investigation-design.md) |
| **Asked for** | Filtering by status; deleting photos, a batch, or a group of photos; whatever else gives the archivists, the judges and the Canton the best experience |

## 1. Deleting in an archive is withdrawing

The originals bucket has Object Lock, and the permissions boundary denies `s3:DeleteObject` on it (`TheArchiveIsWriteOnce`). The ledger and the version history are append-only. So «Löschen» is a **withdrawal**:

- The photo (or every photo of a batch) disappears from the batch view, the review queue, the dashboard counts, the QC numbers, the Excel export and the mirror.
- A queued or running investigation of it is **cancelled**; the worker stops at the next stage boundary.
- An audit-log entry records who withdrew what, when, and the optional reason.
- It can be **restored** («Wiederherstellen») from the Papierkorb view at any time; restoring a photo whose run was cancelled queues a fresh run.
- The master file stays unchanged in storage; the UI says so in one line.

Who may: withdraw / restore / delete a batch — `archivist`, `admin` (`can_approve`). Re-run and bulk-accept — any writing role (`can_write`). The guest sees nothing of this.

## 2. Data (migration `0005_withdrawal`)

| Table | New columns |
|---|---|
| `assets` | `deleted_at timestamptz null`, `deleted_by uuid null → users`, `deletion_reason text null`; index `(org_id, deleted_at)` |
| `upload_batches` | `deleted_at timestamptz null`, `deleted_by uuid null → users` |

No new tables, no RLS change (tenant policies already cover the rows).

## 3. API contract (all under `/api/v1`, JSON, problem+json on error)

### Changed

- `GET /batches` — withdrawn batches are excluded. `?include_deleted=true` includes them; `BatchSummary` gains `deleted_at: datetime | null`.
- `GET /batches/{id}` — withdrawn photos are excluded from `assets` and `counts`. `?include_deleted=true` returns them too. `BatchAsset` gains `deleted_at: datetime | null`, `deletion_reason: string | null`, `captured_at: datetime | null`. `BatchCounts` gains `deleted: int` (always the number of withdrawn photos in the batch, whatever the flag). `BatchOut` gains `deleted_at`.
- `GET /batches/{id}/export?fmt=xlsx[&asset_ids=<uuid>,<uuid>…]` — withdrawn photos are never exported; with `asset_ids` only those (non-withdrawn) photos are exported.
- `GET /batches/{id}/qc` — withdrawn photos are not counted.
- `GET /assets/{id}/case` — `CaseFile` gains `deleted_at`, `deletion_reason`.

### New

| Method | Path | Body | Response | Who |
|---|---|---|---|---|
| `DELETE` | `/assets/{id}` | `{ "reason"?: string ≤ 500 }` (optional body) | `200 BulkResult` (one item) | can_approve |
| `POST` | `/assets/{id}/restore` | — | `200 BulkResult` | can_approve |
| `POST` | `/assets/bulk` | `{ "action": "delete" \| "restore" \| "rerun" \| "accept", "asset_ids": [uuid, …] (1–600), "reason"?: string }` | `200 BulkResult` | delete/restore: can_approve; rerun/accept: can_write |
| `DELETE` | `/batches/{id}` | `{ "reason"?: string }` (optional) | `200 { "batch_id", "deleted_at", "assets": int }` | can_approve |
| `POST` | `/batches/{id}/restore` | — | `200 { "batch_id", "assets": int }` | can_approve |

```jsonc
// BulkResult
{
  "action": "delete",
  "requested": 3,
  "succeeded": 2,
  "results": [
    { "asset_id": "…", "ok": true,  "detail": null },
    { "asset_id": "…", "ok": false, "detail": "already_withdrawn" }   // or not_found, running, no_record, nothing_to_accept
  ]
}
```

Action semantics:
- `delete` — withdraw; cancels a queued/running run. `detail` `already_withdrawn` if it was.
- `restore` — undo a withdrawal; if the latest run was cancelled by the withdrawal, a new run is queued. `detail` `not_withdrawn` if it was not withdrawn.
- `rerun` — queue a fresh run (new run row; the old ledger stays). `detail` `running` if one is queued/running, `withdrawn` if the photo is withdrawn.
- `accept` — for the photo's head record, accept **every emitted ranked field that no human has reviewed yet**, in **one** new version (`actor_kind = human`, `change_kind = approved_snapshot`), one `field_reviews` row per field. Fields left empty stay empty. `detail` `no_record` (not investigated yet) or `nothing_to_accept`. This is the archivist's «alle übernahmefähigen bestätigen»; the web offers it on a selection, typically filtered to Status = übernahmefähig.

## 4. Web (signed-in app)

**Batch view `/batches/[id]`**
- Filter bar: Status chips with live counts — Alle · Übernahmefähig · Prüfbedarf · Unbestimmt · In Arbeit (queued/running/uploading) · Fehlgeschlagen; QC chips — Offen · Maschinell · Geprüft · Korrigiert; free-text search on the file name; sort — Dateiname (natural), Konfidenz ↑/↓, Status. All of it lives in the URL query (`?status=review&qc=open&q=17.3&sort=conf_asc`), so a filtered view can be shared and survives a reload.
- Row checkbox + «alle gefilterten auswählen»; a sticky bulk-action bar with the selection count: **Bestätigen** (accept; enabled when the selection contains finished photos), **Erneut untersuchen**, **Als Excel exportieren** (the selection), **Entfernen** (withdraw). Each destructive action opens an in-app confirmation dialog (never `window.confirm`) naming the count and, for withdrawal, the one line about the immutable master. After a withdrawal, a toast with **Rückgängig** (calls restore).
- Per-row overflow menu with the same actions for one photo.
- Header: batch actions — Excel (whole batch), **Stapel entfernen** (confirm dialog), and a **Papierkorb** toggle showing withdrawn photos (greyed, reason, who/when if available) with **Wiederherstellen**.
- Empty filter result: «Keine Fotos für diesen Filter» with «Filter zurücksetzen».

**Batches list `/batches`** — per-batch delete (confirm) and a «Entfernte Stapel anzeigen» toggle with restore.

**Review `/records/[id]`**
- **Previous / next** within the list the user came from (batch view or queue, in its current filter and sort, passed as `?from=batch:<id>&status=…` or `?from=queue`), with position «12 von 31».
- **Keyboard**: `J`/`→` next, `K`/`←` previous, `A` accept the focused field, `C` correct, `R` reject, `↑`/`↓` move field focus, `?` shortcut help. Inactive while typing in an input.
- **«Alle offenen Felder übernehmen»** button (the single-photo `accept` bulk action) next to the per-field buttons.
- **Map panel**: when the record has a `subject_point` (LV95 E/N), an embedded swisstopo map (`https://map.geo.admin.ch/#/embed?lang=de&center=<E>,<N>&z=9&crosshair=marker&bgLayer=ch.swisstopo.pixelkarte-farbe`) plus «In map.geo.admin.ch öffnen». Without a point: «Kein Motivpunkt bestimmt».
- **Image zoom**: click the photo for a full-screen lightbox (Esc closes; zoom with wheel/pinch or ±).
- Withdrawn photo opened directly: banner «Aus dem Bestand entfernt» with Wiederherstellen.

**Queue `/queue`** — the same Status / QC / search filters; «Prüfen» opens the review with `from=queue` so J/K walks the queue.

## 5. Out of scope (said on the screen where relevant)

Hard deletion of masters (Object Lock, by design); editing a photo's file name or Signatur (not sent to the API yet); moving photos between batches.

## 6. Timing — how long each photo takes (added 06:10)

Every investigation already records `runs.created_at` (queued), `started_at` (claimed by the worker) and `finished_at` (record written, failed or cancelled), and every stage records its own `agent_invocations.started_at` / `ended_at`. The API now exposes them; nothing new is measured.

**`BatchAsset`** gains (all `null` until they exist):
`queued_at`, `started_at`, `finished_at` (ISO datetimes, UTC), `duration_ms` (finished − started, only when finished), `wait_ms` (started − queued).

**`BatchOut`** gains `timing`:
```jsonc
{ "finished": 32,            // runs with a duration
  "mean_ms": 95400, "median_ms": 88100, "p90_ms": 141000,
  "min_ms": 41200, "max_ms": 212000,
  "first_started_at": "…", "last_finished_at": "…",
  "wall_ms": 2460000,        // first start → last finish (or now, while running)
  "per_hour": 46.8 }         // finished / wall hours; null while < 2 finished
```

**`CaseRun`** gains `queued_at`, `duration_ms`, `wait_ms`, and `stages`:
```jsonc
[ { "stage": "perception", "agent": "scene", "acting_as": ["scene", "text-in-image", "skyline"],
    "status": "succeeded", "started_at": "…", "ended_at": "…", "duration_ms": 14200,
    "model": "eu.anthropic.claude-opus-4-6-v1", "input_tokens": 2100, "output_tokens": 640,
    "cost_usd": 0.026 } ]   // in execution order; the produce step is the run's finished_at
```

**Excel** (`Ergebnisse`, after `Run_ID`): `Untersuchung_Beginn`, `Untersuchung_Ende` (ISO, UTC) and `Untersuchung_Dauer_s` (seconds, one decimal); defined on the `Methode` sheet.

**Web**: per row the duration («1 min 28 s») or, while running, a live elapsed counter («läuft seit 0:42», ticking client-side from `started_at`); batch header «Zeit» card — Ø, Median, schnellste/langsamste, Gesamtdauer, Fotos pro Stunde, and «Restzeit ca. …» while running (remaining photos × median ÷ concurrency 4, labelled as an estimate); the duration is a sortable column. Review screen: a stage timeline — one horizontal bar per stage, proportional to its duration, with model, tokens and cost on hover/focus, plus wait time and total.
