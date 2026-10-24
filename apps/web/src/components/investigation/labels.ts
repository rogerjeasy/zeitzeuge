/**
 * The API speaks German for its two verdict vocabularies (they are the
 * workbook's own cell values). These map them to message keys, so en/fr show
 * a translation while the Excel stays in the archive's language.
 */
export const STATUS_KEY: Record<string, "accept" | "review" | "undetermined"> = {
  übernahmefähig: "accept",
  Prüfbedarf: "review",
  unbestimmt: "undetermined",
};

export const QC_KEY: Record<string, "machine" | "confirmed" | "corrected" | "open"> = {
  maschinell: "machine",
  geprüft: "confirmed",
  korrigiert: "corrected",
  offen: "open",
};

export const ABSTAIN_KEYS = new Set([
  "insufficient_evidence",
  "conflicting_evidence",
  "out_of_scope",
  "sensitivity_hold",
]);

export const RUN_STATUS_KEYS = new Set([
  "queued",
  "running",
  "awaiting_review",
  "accepted",
  "abstained",
  "failed",
  "cancelled",
  "superseded",
]);

export const BATCH_STATUS_KEYS = new Set(["uploading", "ready", "running", "done", "failed"]);

export function intlLocale(locale: string): string {
  return locale === "de" ? "de-CH" : locale === "fr" ? "fr-CH" : "en-GB";
}

/**
 * Times are shown in the archive's zone, on the server and in the browser
 * alike — otherwise a UTC server and a Swiss browser render different text and
 * the page fails hydration.
 */
export const ARCHIVE_TZ = "Europe/Zurich";
