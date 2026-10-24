import "server-only";

import { investigationApi, pickQcBatch, resolveAuth, type QcSummary } from "@/lib/api/investigation";
import { EXAMPLE_QC } from "@/lib/data/qc-example";

export type QcView = { qc: QcSummary; batchId: string | null; example: boolean; error: string | null };

/**
 * The QC numbers for the `prio1` batch (or the newest batch when no batch is
 * labelled `prio1`). Falls back to the labelled example only when the
 * archive has no batch at all, or the API could not answer — and then says why.
 */
export async function loadQcView(): Promise<QcView> {
  const auth = await resolveAuth({ refresh: false });
  if (!auth) return { qc: EXAMPLE_QC, batchId: null, example: true, error: "unauthenticated" };
  const batches = await investigationApi.listBatches(auth);
  if (!batches.ok) return { qc: EXAMPLE_QC, batchId: null, example: true, error: batches.problem.code };
  const batch = pickQcBatch(batches.data);
  if (!batch) return { qc: EXAMPLE_QC, batchId: null, example: true, error: null };
  const qc = await investigationApi.qc(auth, batch.id);
  if (!qc.ok) return { qc: EXAMPLE_QC, batchId: null, example: true, error: qc.problem.code };
  return { qc: qc.data, batchId: batch.id, example: false, error: null };
}
