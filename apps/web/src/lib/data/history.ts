import type { RunStatus } from "./dashboard";

/**
 * The audit trail (§17, and the answer to gap F3 at the system level).
 *
 * The editor proves provenance for one field; this proves it for the archive.
 * Everything that ever touched a record is one append-only stream — the run
 * that proposed a value, the hint that redirected it, the human who overruled
 * it, the sign-off that released it, the guardrail that stopped it. An archive
 * will not adopt a machine that cannot show its work, and "show its work"
 * means this list, exportable, with machine and human never confusable.
 */

/** The day the demo calls today. Declared, not read from a clock: the screen is
 *  prerendered, and a relative label computed at render time would disagree
 *  between the server and the browser. Every day header prints the real date
 *  beside the word, so nothing is hidden behind "today". */
export const DEMO_TODAY = "2026-09-22";

/** Fourteen days, ending on DEMO_TODAY — the window the dashboard trend covers,
 *  so the two screens are telling one story about one fortnight. */
export const WINDOW_DAYS = 14;

export type EventKind =
  | "run"
  | "steered"
  | "edited"
  | "rejected"
  | "approved"
  | "exported"
  | "held"
  | "uploaded"
  | "reopened";

/** The distinction the whole product rests on. Never inferred from the kind:
 *  a human can trigger a run, and the machine never approves anything. */
export type Actor = "machine" | "human";

interface EventBase {
  id: string;
  /** ISO date within the window. */
  day: string;
  /** HH:MM, 24-hour. */
  time: string;
  actor: Actor;
  /** A person's name, or a key under `history.actors.*` for a machine. */
  actorName: string;
  /** Present when the event happened to one record. */
  recordId?: string;
  signature?: string;
  collection?: string;
  photoKey?: string;
  src?: string;
}

export type HistoryEvent = EventBase &
  (
    | {
        kind: "run";
        seconds: number;
        costUsd: number;
        agents: number;
        abstentions: number;
        status: RunStatus;
        confidence?: number;
      }
    | { kind: "steered"; hint: string; chain: string; affected: number; kept: number; seconds: number }
    | {
        kind: "edited";
        fieldKey: string;
        isadTag: string;
        /** What the machine had said. Absent when the field had abstained. */
        from?: string;
        to: string;
        /** The confidence the human overruled. */
        overrode?: number;
      }
    | { kind: "rejected"; fieldKey: string; isadTag: string; value: string; overrode: number }
    | { kind: "approved"; version: number; fields: number; abstentions: number }
    | { kind: "exported"; format: string; records: number }
    | { kind: "held"; reasonKey: string }
    | { kind: "uploaded"; count: number }
    | { kind: "reopened"; version: number; reasonKey: string }
  );

/* ── the window ─────────────────────────────────────────────────────────── */

function addDays(iso: string, delta: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** Oldest first, DEMO_TODAY last. */
export const DAYS = Array.from({ length: WINDOW_DAYS }, (_, i) =>
  addDays(DEMO_TODAY, i - (WINDOW_DAYS - 1)),
);

/* ── the cast ───────────────────────────────────────────────────────────── */

const PEOPLE = ["Andrea Betschart", "Marco Reichmuth", "Silvia Ulrich"] as const;

const PHOTOS = [
  { id: "q1", signature: "StASZ Ansichtskarten/0042", collection: "Ansichtskarten", photoKey: "brunnenMythen", src: "/archive/brunnen-mythen.jpg" },
  { id: "q2", signature: "StASZ Ansichtskarten/0455", collection: "Ansichtskarten", photoKey: "axenstein", src: "/archive/brunnen-axenstein.jpg" },
  { id: "q3", signature: "StASZ Ansichtskarten/1204", collection: "Ansichtskarten", photoKey: "quai", src: "/archive/brunnen-quai.jpg" },
  { id: "q4", signature: "StASZ Foto/Bettschart/0117", collection: "Bettschart", photoKey: "goldau", src: "/archive/goldau-mythen.jpg" },
  { id: "q5", signature: "StASZ Foto/Bettschart/0308", collection: "Bettschart", photoKey: "einsiedeln", src: "/archive/einsiedeln-kloster.jpg" },
  { id: "q6", signature: "StASZ Foto/Bettschart/0091", collection: "Bettschart", photoKey: "treib", src: "/archive/treib-mythen.jpg" },
  { id: "q7", signature: "StASZ Ansichtskarten/0312", collection: "Bettschart", photoKey: "schule", src: "/archive/einsiedeln-schule.jpg" },
] as const;

/** Only the fonds the trail actually holds — a filter option that can never
 *  match is worse than no filter at all. */
export const COLLECTIONS = ["Bettschart", "Ansichtskarten"] as const;

const photo = (id: string) => PHOTOS.find((p) => p.id === id)!;

/** Attach a record's identity to an event without repeating it nine times. */
function on(id: string) {
  const p = photo(id);
  return {
    recordId: p.id,
    signature: p.signature,
    collection: p.collection,
    photoKey: p.photoKey,
    src: p.src,
  };
}

/* ── today: the worked session, authored ────────────────────────────────── */

/**
 * The story the demo tells, in the order it happened: a run proposes a record,
 * the archivist disagrees with the dating, steers, corrects two fields by hand,
 * signs it off and exports it. Every other day in the window is the same shapes
 * at lower volume.
 */
const TODAY: HistoryEvent[] = [
  {
    id: "h_t14", kind: "exported", day: DEMO_TODAY, time: "14:31",
    actor: "human", actorName: PEOPLE[0], format: "iiif", records: 1, ...on("q1"),
  },
  {
    id: "h_t13", kind: "approved", day: DEMO_TODAY, time: "14:22",
    actor: "human", actorName: PEOPLE[0], version: 3, fields: 6, abstentions: 1, ...on("q1"),
  },
  {
    id: "h_t12", kind: "edited", day: DEMO_TODAY, time: "14:19",
    actor: "human", actorName: PEOPLE[0],
    fieldKey: "date", isadTag: "3.1.3", from: "1893–1900", to: "1897", overrode: 0.71, ...on("q1"),
  },
  {
    id: "h_t11", kind: "edited", day: DEMO_TODAY, time: "14:18",
    actor: "human", actorName: PEOPLE[0],
    fieldKey: "photographer", isadTag: "3.2.1", to: "Photoglob Zürich", ...on("q1"),
  },
  {
    id: "h_t10", kind: "steered", day: DEMO_TODAY, time: "14:17",
    actor: "human", actorName: PEOPLE[0],
    hint: "Bestand Bettschart, Aufnahme vermutlich vor der Quai-Erweiterung",
    chain: "collection", affected: 5, kept: 10, seconds: 11, ...on("q1"),
  },
  {
    id: "h_t09", kind: "run", day: DEMO_TODAY, time: "14:15",
    actor: "machine", actorName: "pipeline",
    seconds: 94, costUsd: 0.21, agents: 18, abstentions: 1,
    status: "review", confidence: 0.71, ...on("q1"),
  },
  {
    id: "h_t08", kind: "approved", day: DEMO_TODAY, time: "13:52",
    actor: "human", actorName: PEOPLE[1], version: 1, fields: 3, abstentions: 0, ...on("q5"),
  },
  {
    id: "h_t07", kind: "run", day: DEMO_TODAY, time: "13:44",
    actor: "machine", actorName: "pipeline",
    seconds: 48, costUsd: 0.06, agents: 12, abstentions: 0,
    status: "accepted", confidence: 0.97, ...on("q5"),
  },
  {
    id: "h_t06", kind: "rejected", day: DEMO_TODAY, time: "11:26",
    actor: "human", actorName: PEOPLE[2],
    fieldKey: "place", isadTag: "3.1.1", value: "Axenstein, Morschach SZ", overrode: 0.64, ...on("q2"),
  },
  {
    id: "h_t05", kind: "held", day: DEMO_TODAY, time: "11:03",
    actor: "machine", actorName: "guardrail", reasonKey: "minor", ...on("q2"),
  },
  {
    id: "h_t04", kind: "run", day: DEMO_TODAY, time: "10:58",
    actor: "machine", actorName: "pipeline",
    seconds: 112, costUsd: 0.26, agents: 18, abstentions: 2,
    status: "abstained", ...on("q3"),
  },
  {
    id: "h_t03", kind: "exported", day: DEMO_TODAY, time: "09:40",
    actor: "human", actorName: PEOPLE[1], format: "isadCsv", records: 34,
  },
  {
    id: "h_t02", kind: "run", day: DEMO_TODAY, time: "09:12",
    actor: "machine", actorName: "pipeline",
    seconds: 61, costUsd: 0.08, agents: 12, abstentions: 0,
    status: "accepted", confidence: 0.93, ...on("q4"),
  },
  {
    id: "h_t01", kind: "uploaded", day: DEMO_TODAY, time: "08:47",
    actor: "human", actorName: PEOPLE[0], count: 24,
  },
];

/* ── the fortnight behind it, generated ─────────────────────────────────── */

/** A small deterministic generator: the same fortnight on every render, on the
 *  server and in the browser, without thirteen more days written by hand. */
function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const FIELD_EDITS = [
  { fieldKey: "date", isadTag: "3.1.3", from: "1900–1910", to: "1903–1907", overrode: 0.58 },
  { fieldKey: "place", isadTag: "3.1.1", from: "Brunnen SZ", to: "Brunnen, Gemeinde Ingenbohl SZ", overrode: 0.81 },
  { fieldKey: "subject", isadTag: "3.3.1", from: "Seeufer", to: "Quaianlage mit Dampfschiff", overrode: 0.77 },
  { fieldKey: "photographer", isadTag: "3.2.1", to: "Gebr. Wehrli AG" },
  { fieldKey: "title", isadTag: "3.1.2", from: "Kloster", to: "Kloster Einsiedeln, Westfassade", overrode: 0.86 },
];

const EXPORT_FORMATS = ["isadCsv", "ead", "dc", "iiif", "ricoXml"];
const HOLD_REASONS = ["minor", "person", "pii"];

function history(): HistoryEvent[] {
  const random = rng(20260922);
  const events: HistoryEvent[] = [...TODAY];
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const hhmm = (h: number, m: number) =>
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  // Oldest days first so ids read in order; the view sorts anyway.
  DAYS.slice(0, WINDOW_DAYS - 1).forEach((day, dayIndex) => {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    // A cataloguing team works weekdays, and the fortnight ramps up as the
    // pilot gets going — a flat fourteen days would read as generated.
    const count = weekend ? 1 + Math.floor(random() * 2) : 3 + Math.floor(random() * 4) + Math.floor(dayIndex / 4);

    for (let i = 0; i < count; i += 1) {
      const p = pick(PHOTOS);
      const time = hhmm(8 + Math.floor(random() * 10), Math.floor(random() * 60));
      const id = `h_${dayIndex}_${i}`;
      const roll = random();

      if (roll < 0.34) {
        const confidence = 0.58 + random() * 0.4;
        events.push({
          id, kind: "run", day, time, actor: "machine", actorName: "pipeline",
          seconds: 38 + Math.floor(random() * 90),
          costUsd: Number((0.04 + random() * 0.24).toFixed(2)),
          agents: random() < 0.4 ? 12 : 18,
          abstentions: random() < 0.7 ? 0 : 1,
          status: confidence > 0.9 ? "accepted" : "review",
          confidence: Number(confidence.toFixed(2)),
          ...on(p.id),
        });
      } else if (roll < 0.56) {
        events.push({
          id, kind: "edited", day, time, actor: "human", actorName: pick(PEOPLE),
          ...pick(FIELD_EDITS), ...on(p.id),
        });
      } else if (roll < 0.64) {
        const edit = FIELD_EDITS[0];
        events.push({
          id, kind: "rejected", day, time, actor: "human", actorName: pick(PEOPLE),
          fieldKey: edit.fieldKey, isadTag: edit.isadTag, value: edit.from!, overrode: 0.62,
          ...on(p.id),
        });
      } else if (roll < 0.84) {
        events.push({
          id, kind: "approved", day, time, actor: "human", actorName: pick(PEOPLE),
          version: 1 + Math.floor(random() * 3),
          fields: 3 + Math.floor(random() * 4),
          abstentions: random() < 0.6 ? 0 : 1,
          ...on(p.id),
        });
      } else if (roll < 0.9) {
        events.push({
          id, kind: "steered", day, time, actor: "human", actorName: pick(PEOPLE),
          hint: "Bestand Ansichtskarten, nicht Bettschart",
          chain: "collection", affected: 5, kept: 10, seconds: 11,
          ...on(p.id),
        });
      } else if (roll < 0.96) {
        events.push({
          id, kind: "exported", day, time, actor: "human", actorName: pick(PEOPLE),
          format: pick(EXPORT_FORMATS), records: 1 + Math.floor(random() * 40),
        });
      } else {
        events.push({
          id, kind: "held", day, time, actor: "machine", actorName: "guardrail",
          reasonKey: pick(HOLD_REASONS), ...on(p.id),
        });
      }
    }
  });

  // Newest first — an audit trail is read from the top.
  return events.sort((a, b) =>
    a.day === b.day ? b.time.localeCompare(a.time) : b.day.localeCompare(a.day),
  );
}

export const EVENTS = history();

/* ── reading the trail ──────────────────────────────────────────────────── */

export type Preset = "all" | "runs" | "edits" | "approvals" | "exports";

export const PRESETS: Preset[] = ["all", "runs", "edits", "approvals", "exports"];

const PRESET_KINDS: Record<Preset, EventKind[] | null> = {
  all: null,
  runs: ["run", "held"],
  edits: ["edited", "rejected", "steered"],
  approvals: ["approved", "reopened"],
  exports: ["exported", "uploaded"],
};

export interface Filters {
  preset: Preset;
  actor: Actor | "all";
  collection: string;
  query: string;
  /** An ISO day, set by clicking a column in the activity band. */
  day: string | null;
}

export const NO_FILTERS: Filters = {
  preset: "all",
  actor: "all",
  collection: "all",
  query: "",
  day: null,
};

export function filterEvents(events: HistoryEvent[], f: Filters) {
  const kinds = PRESET_KINDS[f.preset];
  const query = f.query.trim().toLowerCase();

  return events.filter((event) => {
    if (kinds && !kinds.includes(event.kind)) return false;
    if (f.actor !== "all" && event.actor !== f.actor) return false;
    if (f.collection !== "all" && event.collection !== f.collection) return false;
    if (f.day && event.day !== f.day) return false;
    if (query) {
      const haystack = `${event.signature ?? ""} ${event.actorName} ${event.collection ?? ""}`;
      if (!haystack.toLowerCase().includes(query)) return false;
    }
    return true;
  });
}

/** Group a filtered list into day buckets, newest day first. */
export function groupByDay(events: HistoryEvent[]) {
  const buckets = new Map<string, HistoryEvent[]>();
  for (const event of events) {
    const list = buckets.get(event.day);
    if (list) list.push(event);
    else buckets.set(event.day, [event]);
  }
  return [...buckets.entries()].map(([day, items]) => ({ day, items }));
}

export interface BandDay {
  day: string;
  machine: number;
  human: number;
  total: number;
}

/** The fourteen columns of the activity band. Always all fourteen days, even
 *  the empty ones — a weekend that vanishes makes the week look busier. */
export function activityBand(events: HistoryEvent[]): BandDay[] {
  return DAYS.map((day) => {
    const items = events.filter((event) => event.day === day);
    const machine = items.filter((event) => event.actor === "machine").length;
    return { day, machine, human: items.length - machine, total: items.length };
  });
}

/** The four numbers above the trail. Derived, never hard-coded, so a change to
 *  the events can never leave the summary saying something else. */
export function summarise(events: HistoryEvent[]) {
  return {
    events: events.length,
    approved: events.filter((e) => e.kind === "approved").length,
    overrides: events.filter((e) => e.kind === "edited" || e.kind === "rejected").length,
    held: events.filter((e) => e.kind === "held").length,
  };
}

/** The trail as a file. Governance asked for no lock-in; this is the cheapest
 *  possible proof of it (§8.3). */
export function toCsv(events: HistoryEvent[]) {
  const head = ["timestamp", "kind", "actor", "actor_name", "signature", "collection", "detail"];
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const rows = events.map((event) => {
    const detail = Object.entries(event)
      .filter(([key]) => !["id", "day", "time", "kind", "actor", "actorName", "recordId", "signature", "collection", "photoKey", "src"].includes(key))
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");

    return [
      `${event.day}T${event.time}`,
      event.kind,
      event.actor,
      event.actorName,
      event.signature ?? "",
      event.collection ?? "",
      detail,
    ].map(cell).join(",");
  });

  return [head.join(","), ...rows].join("\n");
}
