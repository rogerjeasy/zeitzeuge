/**
 * The profile is a record of what this archivist taught the system.
 *
 * §5.4 M5: corrections become gazetteer aliases, few-shot exemplars and
 * regression cases, and "every improvement is attributable to a named
 * archivist — which is exactly how archival authority control has always
 * worked". This screen is that attribution, made visible.
 */
export const PROFILE = {
  name: "Andrea Betschart",
  initials: "AB",
  email: "a.betschart@sz.ch",
  /** key under `settings.archive.roles.*` */
  role: "archivist",
  archive: "Staatsarchiv Schwyz",
  memberSince: "2026-10-23",
};

export const CONTRIBUTION_STATS = [
  { id: "reviewed", value: 412 },
  { id: "aliases", value: 34 },
  { id: "evalCases", value: 18 },
  { id: "confirmed", value: 96, isPercent: true },
] as const;

export type CorrectionEffect = "alias" | "evalCase" | "exemplar";

export interface Correction {
  id: string;
  /** key under `ledger.fields.*` */
  field: string;
  from: string;
  to: string;
  signature: string;
  effect: CorrectionEffect;
  daysAgo: number;
}

export const RECENT_CORRECTIONS: Correction[] = [
  { id: "c1", field: "place", from: "Einsiedeln", to: "Kloster Einsiedeln SZ", signature: "StASZ Foto/Bettschart/0308", effect: "alias", daysAgo: 0 },
  { id: "c2", field: "date", from: "1893–1900", to: "1897", signature: "StASZ Ansichtskarten/0042", effect: "evalCase", daysAgo: 1 },
  { id: "c3", field: "subject", from: "Kirche", to: "Pfarrkirche St. Martin", signature: "StASZ Foto/Bettschart/0117", effect: "exemplar", daysAgo: 2 },
  { id: "c4", field: "place", from: "Brunnen", to: "Brunnen, Gemeinde Ingenbohl SZ", signature: "StASZ Ansichtskarten/1204", effect: "alias", daysAgo: 4 },
  { id: "c5", field: "process", from: "Fotografie", to: "Photochromdruck", signature: "StASZ Ansichtskarten/0455", effect: "exemplar", daysAgo: 6 },
];
