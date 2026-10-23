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
export const METRICS = [
  { id: "described", value: 12438, suffix: "", decimals: 0 },
  { id: "minutesSaved", value: 3.2, suffix: " Min", decimals: 1 },
  { id: "precision", value: 94, suffix: " %", decimals: 0 },
  { id: "abstention", value: 11, suffix: " %", decimals: 0 },
] as const;
