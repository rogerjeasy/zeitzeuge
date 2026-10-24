"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { REASON_MAX, type BatchSummary } from "@/lib/api/investigation-types";
import { restoreBatchAction, withdrawBatchAction } from "@/lib/investigation/actions";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ToastRegion, useToasts } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { ARCHIVE_TZ, BATCH_STATUS_KEYS, intlLocale } from "./labels";

/**
 * The batch list's rows, with «Entfernen» per batch and «Wiederherstellen»
 * for removed ones (spec §4). Removing hides the row at once and offers
 * «Rückgängig»; the server list is re-read afterwards.
 */
export function BatchTable({ batches, canApprove }: { batches: BatchSummary[]; canApprove: boolean }) {
  const t = useTranslations("investigation.batches");
  const tb = useTranslations("investigation.batch");
  const tm = useTranslations("investigation.manage");
  const intl = intlLocale(useLocale());
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [revived, setRevived] = useState<Set<string>>(() => new Set());
  // Undo after the list was re-read: the row comes back from its snapshot at once.
  const [snapshots, setSnapshots] = useState<Map<string, BatchSummary>>(() => new Map());
  const [pending, setPending] = useState<BatchSummary | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { toasts, push, dismiss } = useToasts();

  const time = (iso: string) =>
    new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeStyle: "short", timeZone: ARCHIVE_TZ }).format(new Date(iso));
  const reread = () => startTransition(() => router.refresh());
  const errorText = (code: string) =>
    ["forbidden", "network", "unauthenticated", "not_found", "conflict"].includes(code) ? tm(`errors.${code}`) : code;

  async function restore(batch: BatchSummary) {
    setBusy(batch.id);
    setHidden((prev) => new Set([...prev].filter((id) => id !== batch.id)));
    setRevived((prev) => new Set(prev).add(batch.id));
    setSnapshots((prev) => new Map(prev).set(batch.id, { ...batch, deleted_at: null }));
    const result = await restoreBatchAction(batch.id);
    setBusy(null);
    if (!result.ok) {
      setRevived((prev) => new Set([...prev].filter((id) => id !== batch.id)));
      setSnapshots((prev) => {
        const next = new Map(prev);
        next.delete(batch.id);
        return next;
      });
      push({ tone: "error", message: tm("failed", { code: errorText(result.code) }) });
      return;
    }
    push({ tone: "success", message: tm("batchRestored", { count: result.data.assets }) });
    reread();
  }

  async function remove(batch: BatchSummary) {
    setBusy(batch.id);
    const result = await withdrawBatchAction(batch.id, reason.trim() || undefined);
    setBusy(null);
    if (!result.ok) {
      push({ tone: "error", message: tm("failed", { code: errorText(result.code) }) });
      return;
    }
    setPending(null);
    setReason("");
    setRevived((prev) => new Set([...prev].filter((id) => id !== batch.id)));
    setHidden((prev) => new Set(prev).add(batch.id));
    push({
      tone: "success",
      message: `${tm("batchRemoved", { count: result.data.assets })} ${tm("masterKept", { count: result.data.assets })}`,
      action: { label: tm("undo"), onClick: () => void restore(batch) },
      durationMs: 12_000,
    });
    reread();
  }

  const listed = new Set(batches.map((b) => b.id));
  const ghosts = [...snapshots.values()].filter((b) => !listed.has(b.id) && revived.has(b.id));
  const rows = [...batches, ...ghosts]
    .filter((b) => !hidden.has(b.id) || b.deleted_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <>
      <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
        {rows.map((b) => {
          const removed = (Boolean(b.deleted_at) || hidden.has(b.id)) && !revived.has(b.id);
          return (
            <li
              key={b.id}
              className={cn(
                "flex min-w-0 items-center gap-2 pr-3 first:rounded-t-[var(--radius-card)] last:rounded-b-[var(--radius-card)]",
                removed && "bg-surface-2/60",
              )}
            >
              <Link
                href={`/batches/${b.id}`}
                className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-[var(--radius-card)] px-4 py-3.5 transition-colors hover:bg-surface-2/60 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto]"
              >
                <span className={cn("flex min-w-0 flex-col gap-0.5", removed && "opacity-75")}>
                  <span className="truncate font-mono text-[0.875rem] font-medium text-foreground-strong">
                    {b.label ?? tb("unlabelled")}
                  </span>
                  <span className="text-[0.75rem] text-muted [overflow-wrap:anywhere]">
                    {tb("created", { time: time(b.created_at) })}
                    {b.mirrored_from && <> · {t("mirror")}</>}
                    {removed && (
                      <>
                        {" · "}
                        <span className="text-refuted">
                          {b.deleted_at ? tm("removedAt", { time: time(b.deleted_at) }) : tm("removedJustNow")}
                        </span>
                      </>
                    )}
                  </span>
                </span>
                <span className="hidden font-mono text-[0.75rem] tabular-nums text-foreground sm:block">
                  {t("photos", { count: b.asset_count })}
                </span>
                <span className="hidden text-[0.75rem] text-muted sm:block">
                  {BATCH_STATUS_KEYS.has(b.status) ? tb(`batchStatus.${b.status}`) : b.status}
                </span>
                <ArrowRight aria-hidden className="size-4 text-muted-2" strokeWidth={2} />
              </Link>
              {canApprove &&
                (removed ? (
                  <button
                    type="button"
                    onClick={() => void restore(b)}
                    disabled={busy === b.id}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-[0.75rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence disabled:opacity-60"
                  >
                    {busy === b.id ? (
                      <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />
                    ) : (
                      <RotateCcw aria-hidden className="size-3.5" strokeWidth={2} />
                    )}
                    <span className="sr-only sm:not-sr-only">{tm("restore")}</span>
                    <span className="sr-only">{b.label ?? tb("unlabelled")}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPending(b)}
                    aria-label={tm("removeBatchNamed", { label: b.label ?? tb("unlabelled") })}
                    className="grid size-9 shrink-0 place-items-center rounded-lg border border-line-strong bg-surface text-muted transition-colors hover:border-refuted/60 hover:bg-refuted-soft hover:text-refuted"
                  >
                    <Trash2 aria-hidden className="size-4" strokeWidth={2} />
                  </button>
                ))}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => {
          setPending(null);
          setReason("");
        }}
        onConfirm={() => pending && void remove(pending)}
        busy={busy !== null && busy === pending?.id}
        tone="danger"
        title={tm("removeBatchTitle", { label: pending?.label ?? tb("unlabelled") })}
        description={
          <>
            <p>{tm("removeBatchBody", { count: pending?.asset_count ?? 0 })}</p>
            <p className="font-medium text-foreground">{tm("masterKept", { count: pending?.asset_count ?? 2 })}</p>
          </>
        }
        confirmLabel={tm("removeBatchConfirm")}
        cancelLabel={tm("cancel")}
      >
        <label className="flex flex-col gap-1 text-[0.6875rem] text-muted">
          {tm("reasonLabel")}
          <textarea
            value={reason}
            maxLength={REASON_MAX}
            rows={2}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-16 w-full min-w-0 resize-y rounded-lg border border-line-strong bg-background px-2.5 py-2 text-[0.8125rem] text-foreground outline-none focus-visible:border-evidence"
          />
        </label>
      </ConfirmDialog>

      <ToastRegion toasts={toasts} dismiss={dismiss} label={tm("toastRegion")} closeLabel={tm("dismiss")} />
    </>
  );
}
