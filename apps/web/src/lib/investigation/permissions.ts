/**
 * What the signed-in role may do on the batch-management surface — the web's
 * mirror of the API's role checks (`db/models/enums.py`, commit 9cc759f). The
 * API stays the authority; this only decides which controls are shown.
 *
 * - withdraw / restore / delete a batch: admin, archivist (`can_approve`)
 * - accept / correct / reject fields, bulk «Bestätigen»: admin, archivist, reviewer
 * - re-run: every writing role, the operator included (`can_write`)
 */

const APPROVE = new Set(["admin", "archivist"]);
const REVIEW = new Set(["admin", "archivist", "reviewer"]);
const WRITE = new Set(["admin", "archivist", "reviewer", "operator"]);

export type Capabilities = {
  /** Withdraw, restore, delete a batch. */
  canApprove: boolean;
  /** Accept, correct, reject a field; accept in bulk. */
  canReview: boolean;
  /** Re-run an investigation. */
  canWrite: boolean;
};

export function capabilitiesFor(role: string | null | undefined): Capabilities {
  const r = String(role ?? "").toLowerCase();
  return { canApprove: APPROVE.has(r), canReview: REVIEW.has(r), canWrite: WRITE.has(r) };
}
