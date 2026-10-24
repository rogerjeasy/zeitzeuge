"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Loader2, Trash2, Info, Layers, CloudUpload, Lock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useUploadQueue } from "@/hooks/use-upload-queue";
import { EmptyState } from "@/components/ui/empty-state";
import { blockingIssues, issuesFor } from "@/lib/upload/validation";
import { Dropzone } from "./dropzone";
import { AssetRow } from "./asset-row";
import { cn } from "@/lib/cn";
import { Field } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import { ApiNotice } from "@/components/investigation/api-notice";
import { useLiveBatch } from "@/hooks/use-live-batch";
import { FINISHED_RUN_STATUSES } from "@/lib/api/investigation-types";

const LABEL = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/**
 * Real files only: the screen opens on an empty drop zone, pairs recto and
 * verso by filename, and sends each front straight to the archive's storage.
 */
export function UploadScreen({
  readOnly,
  apiProblem,
}: {
  /** The demo guest may look, never write. */
  readOnly: boolean;
  /** Why the API could not be asked, if it could not. */
  apiProblem: string | null;
}) {
  const t = useTranslations("upload");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;

  const q = useUploadQueue();

  // The investigation runs on the server and survives a reload; the transfer
  // does not — the browser cannot keep the files across a reload. While any
  // file is still on its way to storage, ask before the page is left.
  useEffect(() => {
    if (!q.running) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [q.running]);

  // The real path: a batch label (default `prio1`) and the Prio-1 flag.
  const [label, setLabel] = useState("prio1");
  const [prio1, setPrio1] = useState(true);
  const [realRun, setRealRun] = useState<{ batchId: string; label: string; reused: boolean } | null>(null);
  const [realProblem, setRealProblem] = useState<string | null>(null);
  const labelValid = LABEL.test(label);

  const live = useLiveBatch(realRun?.batchId ?? null);
  // Reflect finished and failed runs back onto the rows that started them.
  useEffect(() => {
    if (!live.batch) return;
    const remote = new Map(live.batch.assets.map((a) => [a.asset_id, a]));
    for (const asset of q.assets) {
      const r = asset.remoteId ? remote.get(asset.remoteId) : undefined;
      if (!r) continue;
      if (r.run_status && FINISHED_RUN_STATUSES.has(r.run_status) && asset.status !== "done") {
        q.update(asset.id, { status: "done" });
      } else if (r.run_status === "failed" && asset.status !== "error") {
        q.update(asset.id, { status: "error", error: r.error ?? "run_failed" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.batch]);

  async function startReal() {
    setRealProblem(null);
    const result = await q.startReal({ label, priority: prio1 ? 1 : null });
    if (result.ok) setRealRun(result);
    else setRealProblem(result.code);
  }

  const blocking = blockingIssues(q.issues);
  const hasAssets = q.assets.length > 0;
  const allDone = hasAssets && q.assets.every((a) => a.status === "done");
  const sent = q.assets.filter((a) => a.status === "analysing" || a.status === "done").length;
  const failedCount = q.assets.filter((a) => a.status === "error").length;
  const versosHeld = q.assets.filter((a) => a.verso).length;
  const pending = q.assets.filter((a) => a.status === "queued" || a.status === "error").length;
  const finished = Boolean(realRun && pending === 0);

  const bytes = (n: number) => {
    const units = ["B", "kB", "MB", "GB"];
    let value = n;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${new Intl.NumberFormat(intl, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${units[unit]}`;
  };

  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
          {t("title")}
        </h1>
        <p className="max-w-[70ch] text-[0.875rem] text-muted">{t("subtitle")}</p>
      </header>

      {readOnly ? (
        <EmptyState
          icon={Lock}
          title={t("guest.title")}
          body={t("guest.body")}
          action={{ href: "/batches", label: t("guest.cta") }}
        />
      ) : (
        <Dropzone onFiles={(files) => q.add(files)} busy={q.busy} compact={hasAssets} />
      )}

      {apiProblem && !readOnly && <ApiNotice code={apiProblem} />}

      {!readOnly && !hasAssets && !q.busy && (
        <section
          aria-labelledby="upload-guide-heading"
          className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-line bg-surface px-4 py-4 sm:px-5"
        >
          <h2 id="upload-guide-heading" className="flex items-center gap-2 text-[0.8125rem] font-medium text-foreground-strong">
            <Info aria-hidden className="size-4 shrink-0 text-muted-2" strokeWidth={1.9} />
            {t("guide.title")}
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-9 text-[0.8125rem] leading-relaxed text-muted marker:text-muted-2">
            <li>{t("guide.what")}</li>
            <li>{t("guide.storage")}</li>
            <li>{t("guide.label")}</li>
            <li>{t("guide.prio1")}</li>
          </ul>
        </section>
      )}

      {hasAssets && (
        <section
          aria-labelledby="real-upload-heading"
          className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-3.5 py-3.5 sm:px-4"
        >
          <div className="flex items-start gap-2.5">
            <CloudUpload aria-hidden className="mt-px size-4 shrink-0 text-evidence" strokeWidth={1.9} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 id="real-upload-heading" className="text-[0.8125rem] font-medium text-foreground-strong">
                {t("real.title")}
              </h2>
              <p className="max-w-[80ch] text-[0.75rem] leading-snug text-muted">{t("real.hint")}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end">
            <Field
              label={t("real.labelField")}
              value={label}
              disabled={q.running}
              onChange={(e) => setLabel(e.target.value.trim().toLowerCase())}
              error={labelValid ? undefined : t("real.labelInvalid")}
              hint={labelValid ? t("real.labelHint") : undefined}
            />
            <label className="flex h-11 items-center gap-2.5 text-[0.8125rem] text-foreground">
              <Toggle checked={prio1} onChange={setPrio1} label={t("real.prio1")} disabled={q.running} />
              {t("real.prio1")}
            </label>
          </div>
          {versosHeld > 0 && (
            <p className="text-[0.75rem] text-review">{t("real.versoNotSent", { count: versosHeld })}</p>
          )}
        </section>
      )}

      {realProblem && <ApiNotice code={realProblem} />}

      {realRun && (
        <div
          aria-live="polite"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-corroborated/35 bg-corroborated-soft px-3.5 py-3"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-[0.8125rem] font-medium text-corroborated">
              {t(realRun.reused ? "real.addedTo" : "real.created", { label: realRun.label })}
            </p>
            <p className="text-[0.75rem] text-foreground">
              {t("real.progress", { sent, failed: failedCount, total: q.assets.length })}
              {" · "}
              {t(`real.live.${live.mode}`)}
            </p>
          </div>
          <Link
            href={`/batches/${realRun.batchId}`}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[0.75rem] font-medium text-background"
          >
            {t("real.toBatch")}
            <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
          </Link>
        </div>
      )}

      {/* Why pairing happened at all — stated once, above the queue. */}
      {hasAssets && (
        <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2/50 px-3.5 py-3">
          <Info aria-hidden className="mt-px size-4 shrink-0 text-muted-2" strokeWidth={1.9} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-[0.8125rem] font-medium text-foreground">{t("pairingTitle")}</p>
            <p className="max-w-[78ch] text-[0.75rem] leading-snug text-muted">{t("pairingHint")}</p>
          </div>
        </div>
      )}

      {q.rejected.length > 0 && (
        <Notice tone="review" title={t("rejectedTitle", { count: q.rejected.length })}>
          <p className="text-[0.75rem] text-muted">{t("rejectedHint")}</p>
          <p className="font-mono text-[0.6875rem] text-muted">{q.rejected.join(", ")}</p>
        </Notice>
      )}

      {q.zipProblems.length > 0 && (
        <Notice tone="review" title={t("zipTitle")}>
          <ul className="flex flex-col gap-0.5">
            {q.zipProblems.map((problem, i) => (
              <li key={i} className="font-mono text-[0.6875rem] text-muted">
                {problem.name} — {t(`zipReasons.${problem.reason}`)}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {hasAssets ? (
        <section className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-foreground">
              <span className="font-medium">
                {t("summary", { files: q.stats.files, assets: q.stats.assets })}
              </span>
              <span aria-hidden className="text-line-strong">·</span>
              <span className="text-corroborated">{t("summaryPaired", { count: q.stats.paired })}</span>
              {q.stats.withoutVerso > 0 && (
                <>
                  <span aria-hidden className="text-line-strong">·</span>
                  <span className="text-muted">{t("summaryUnpaired", { count: q.stats.withoutVerso })}</span>
                </>
              )}
            </p>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => q.clear()}
                disabled={q.running}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[0.75rem] text-muted transition-colors hover:bg-refuted-soft hover:text-refuted disabled:opacity-50"
              >
                <Trash2 aria-hidden className="size-3.5" strokeWidth={1.9} />
                {t("clearAll")}
              </button>
            </div>
          </header>

          <ul className="flex flex-col divide-y divide-line">
            {q.assets.map((asset) => (
              <AssetRow
                key={asset.id}
                asset={asset}
                issues={issuesFor(q.issues, asset.id)}
                locked={q.running || asset.status !== "queued"}
                onRemove={() => q.remove(asset.id)}
                onUnpair={() => q.unpair(asset.id)}
                onPairInto={(sourceId) => q.pairInto(sourceId, asset.id)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {hasAssets && (
        <div className="sticky bottom-4 z-20">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-lift backdrop-blur-md">
            <p className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-2">
              <Layers aria-hidden className="size-3.5" strokeWidth={1.9} />
              {t("totalSize", { size: bytes(q.stats.bytes) })}
            </p>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {allDone || finished ? (
                <Link
                  href={realRun ? `/batches/${realRun.batchId}` : "/batches"}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-corroborated px-4 text-[0.8125rem] font-medium text-background"
                >
                  {t("real.toBatch")}
                  <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void startReal()}
                  disabled={q.running || blocking.length > 0 || !labelValid}
                  aria-busy={q.running}
                  title={blocking.length > 0 ? t("startBlocked") : undefined}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[0.8125rem] font-medium transition-colors",
                    "bg-foreground text-background hover:bg-foreground-strong",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                  )}
                >
                  {q.running ? (
                    <>
                      <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />
                      {t("runningCta")}
                    </>
                  ) : (
                    <>
                      <CloudUpload aria-hidden className="size-3.5" strokeWidth={2.2} />
                      {failedCount > 0 && realRun
                        ? t("real.retryCta", { count: failedCount })
                        : t("real.startCta", { count: q.stats.assets })}
                    </>
                  )}
                </button>
              )}
            </div>

            {blocking.length > 0 && !q.running && (
              <p className="w-full text-[0.6875rem] text-refuted">
                {t("issuesTitle", { count: blocking.length })} · {t("startBlocked")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: "review";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border px-3.5 py-3",
        tone === "review" && "border-review/35 bg-review-soft",
      )}
    >
      <p className="text-[0.8125rem] font-medium text-review">{title}</p>
      {children}
    </div>
  );
}
