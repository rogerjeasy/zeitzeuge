import type { QcSummary } from "@/lib/api/investigation-types";

/**
 * An example Prio-1 QC summary, shown only when the archive has no real batch
 * yet — and always labelled as an example where it is shown. The shape is the
 * API's `QcSummaryOut`, so the panel renders both through one code path.
 */
export const EXAMPLE_QC: QcSummary = {
  batch: "prio1",
  total: 50,
  processed: 50,
  confirmed: 21,
  corrected: 9,
  open: 6,
  machine: 14,
  overrideRate: {
    locality: 0.04,
    municipality: 0.0,
    building: 0.31,
    landscape_feature: 0.12,
    street: 0.18,
  },
};
