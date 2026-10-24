/** The three signature capabilities (§6). Copy lives in messages/*.json. */
export const CAPABILITIES = [
  { id: "terrain", accent: "evidence", metricValue: "0.941", stat: "±180 m" },
  { id: "chronology", accent: "review", metricValue: "1893–1900", stat: "7 Werkzeuge" },
  { id: "verso", accent: "sepia", metricValue: "Kurrent", stat: "2 Leser" },
] as const;

export type CapabilityId = (typeof CAPABILITIES)[number]["id"];

/** Personas (§4.2). */
export const PERSONAS = [
  { id: "andrea", initials: "AB", accent: "evidence" },
  { id: "marco", initials: "MR", accent: "review" },
  { id: "keller", initials: "DK", accent: "sepia" },
  { id: "ueli", initials: "UZ", accent: "corroborated" },
] as const;

/** Governance guarantees (§10.5, §9.4) — Kantons-IT's section. */
export const SOVEREIGNTY = [
  { id: "residency", icon: "shield" },
  { id: "rls", icon: "database" },
  { id: "audit", icon: "history" },
  { id: "export", icon: "download" },
] as const;

/** The counters in the hero. */
/**
 * Measured on the Prio-1 run, 24.10.2026 (production export, 11:31):
 * - described: photos with a finished investigation (49 of 50; one run failed);
 * - runMinutes: mean wall-clock investigation per photo, 422 s (median 294 s);
 * - precision: of the fields the team labelled and the system filled, the share
 *   that names the labelled value — 34 of 43 on 17 photos (evaluate.py);
 * - abstention: ranked fields left open on purpose — 105 of 245.
 */
export const METRICS = [
  { id: "described", value: 49, suffix: "", decimals: 0 },
  { id: "runMinutes", value: 7.0, suffix: " Min", decimals: 1 },
  { id: "precision", value: 79, suffix: " %", decimals: 0 },
  { id: "abstention", value: 43, suffix: " %", decimals: 0 },
] as const;
