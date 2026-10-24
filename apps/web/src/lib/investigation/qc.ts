import "server-only";

import { investigationApi, pickQcBatch, resolveAuth, type QcSummary } from "@/lib/api/investigation";

/**
 * `qc` is null when there is nothing to show: the archive has no batch yet
 * (`error` null), or the API could not answer (`error` says why).
 */
export type QcView = { qc: QcSummary | null; batchId: string | null; error: string | null };

/**
 * The QC numbers for the `prio1` batch (or the newest batch when no batch is
 * labelled `prio1`). Real numbers only: no batch means no panel.
 */
export async function loadQcView(): Promise<QcView> {
  const auth = await resolveAuth({ refresh: false });
  if (!auth) return { qc: null, batchId: null, error: "unauthenticated" };
  const batches = await investigationApi.listBatches(auth);
  if (!batches.ok) return { qc: null, batchId: null, error: batches.problem.code };
  const batch = pickQcBatch(batches.data);
  if (!batch) return { qc: null, batchId: null, error: null };
  const qc = await investigationApi.qc(auth, batch.id);
  if (!qc.ok) return { qc: null, batchId: batch.id, error: qc.problem.code };
  return { qc: qc.data, batchId: batch.id, error: null };
}
