import { GALLERY, type ArchivePhoto } from "./archive";
import type { Decision } from "./record";

/**
 * The records the auth panel cycles through. Values are proper nouns and date
 * brackets, so they carry across locales untranslated; the field labels and
 * decision names come from the existing `ledger.*` namespace.
 *
 * Each record deliberately ends on an abstention. The login screen is the first
 * surface a new archivist sees, and the first thing it should say about the
 * system is that it stops when the evidence stops.
 */
export interface PanelField {
  /** key under `ledger.fields.*` */
  key: string;
  value?: string;
  confidence?: number;
  decision: Decision;
}

export interface PanelRecord {
  photo: ArchivePhoto;
  fields: PanelField[];
}

const byKey = (key: string) => GALLERY.find((p) => p.key === key)!;

export const PANEL_RECORDS: PanelRecord[] = [
  {
    photo: byKey("goldau"),
    fields: [
      { key: "place", value: "Goldau, Gemeinde Arth SZ", confidence: 0.93, decision: "emit" },
      { key: "date", value: "1890–1900", confidence: 0.68, decision: "emit_with_review" },
      { key: "photographer", decision: "abstain" },
    ],
  },
  {
    photo: byKey("einsiedeln"),
    fields: [
      { key: "place", value: "Kloster Einsiedeln SZ", confidence: 0.97, decision: "emit" },
      { key: "subject", value: "Klosterkirche, Westfassade", confidence: 0.91, decision: "emit" },
      { key: "photographer", decision: "abstain" },
    ],
  },
  {
    photo: byKey("treib"),
    fields: [
      { key: "place", value: "Treib, Gemeinde Seelisberg UR", confidence: 0.88, decision: "emit" },
      { key: "date", value: "1895–1905", confidence: 0.62, decision: "emit_with_review" },
      { key: "photographer", decision: "abstain" },
    ],
  },
];

/** Rotation cadence for the panel, in milliseconds. */
export const PANEL_INTERVAL = 7000;

/** The counter under the panel. Matches the landing page's figure. */
export const PANEL_PROCESSED_TODAY = 318;
