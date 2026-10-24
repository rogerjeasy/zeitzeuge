"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Loader2, Play, Trash2, Info, Layers, Sparkles, CloudUpload, FlaskConical } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Select } from "@/components/ui/select";
import { COLLECTIONS, RUN_MODES, CATALOGUING_DEFAULTS } from "@/lib/data/settings";
import { useUploadQueue } from "@/hooks/use-upload-queue";
import { loadDemoScans } from "@/lib/upload/demo-seed";
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

export function UploadScreen({
  readOnly,
  apiProblem,
  hasRealBatch,
}: {
  /** The demo guest may watch, never write. */
  readOnly: boolean;
  /** Why the API could not be asked, if it could not. */
  apiProblem: string | null;
  /** The archive already holds a real batch: no example seed then. */
  hasRealBatch: boolean;
}) {
  const t = useTranslations("upload");
  const tModes = useTranslations("settings.cataloguing.modes");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;

  const q = useUploadQueue(CATALOGUING_DEFAULTS.defaultCollection);
  const [mode, setMode] = useState<string>(CATALOGUING_DEFAULTS.mode);
  const [seeded, setSeeded] = useState(false);
  const seedStarted = useRef(false);

  // The real path: a batch label (default `prio1`) and the Prio-1 flag.
  const [label, setLabel] = useState("prio1");
  const [prio1, setPrio1] = useState(true);
  const [realRun, setRealRun] = useState<{ batchId: string; label: string; reused: boolean } | null>(null);
  const [realProblem, setRealProblem] = useState<string | null>(null);
  const realOpen = !readOnly && apiProblem === null;
  /** Real upload for the visitor's own files; the labelled example stays simulated. */
  const real = realOpen && !seeded;
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
    const result = await q.startReal({ label, priority: prio1 ? 1 : null, mode });
    if (result.ok) setRealRun(result);
    else setRealProblem(result.code);
  }

  // Fill the queue with examples on first open so the screen shows its design
  // straight away. Runs once, and never over anything the visitor added.
  useEffect(() => {
    if (seedStarted.current || hasRealBatch) return;
    seedStarted.current = true;
    loadDemoScans().then((files) => {
      if (files.length === 0) return;
      q.add(files);
      setSeeded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const blocking = blockingIssues(q.issues);
  const hasAssets = q.assets.length > 0;
  const allDone = hasAssets && q.assets.every((a) => a.status === "done");
  const sent = q.assets.filter((a) => a.status === "analysing" || a.status === "done").length;
  const failedCount = q.assets.filter((a) => a.status === "error").length;
  const versosHeld = q.assets.filter((a) => a.verso).length;
  const pending = q.assets.filter((a) => a.status === "queued" || a.status === "error").length;
  const finishedReal = Boolean(real && realRun && pending === 0);

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

      <Dropzone
        onFiles={(files) => {
          setSeeded(false);
          q.add(files);
        }}
        busy={q.busy}
        compact={hasAssets}
      />

      {apiProblem && (
        <ApiNotice code={apiProblem} />
      )}
      {readOnly && apiProblem === null && (
        <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2/50 px-3.5 py-3">
          <FlaskConical aria-hidden className="mt-px size-4 shrink-0 text-muted-2" strokeWidth={1.9} />
          <p className="min-w-0 text-[0.75rem] leading-snug text-muted">{t("real.guest")}</p>
        </div>
      )}

      {seeded && hasAssets && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-2/50 px-3.5 py-3">
          <Sparkles aria-hidden className="size-4 shrink-0 text-muted-2" strokeWidth={1.9} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-[0.8125rem] font-medium text-foreground">{t("demoTitle")}</p>
            <p className="text-[0.75rem] leading-snug text-muted">{t("demoHint")}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              q.clear();
              setSeeded(false);
            }}
            className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[0.75rem] font-medium text-foreground transition-colors hover:border-refuted hover:text-refuted"
          >
            <Trash2 aria-hidden className="size-3.5" strokeWidth={1.9} />
            {t("clearAll")}
          </button>
        </div>
      )}

      {real && hasAssets && (
        <section
          aria-labelledby="real-upload-heading"
          className="flex flex-col gap-3 rounded-xl border border-evidence/30 bg-evidence-soft/40 px-3.5 py-3.5 sm:px-4"
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
              <Select
                label={t("collectionAll")}
                hideLabel
                className="w-[15rem]"
                value=""
                disabled={q.running}
                onChange={(e) => e.target.value && q.applyCollectionToAll(e.target.value)}
                options={[
                  { value: "", label: t("collectionAll") },
                  ...COLLECTIONS.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
              <button
                type="button"
                onClick={() => {
                  q.clear();
                  setSeeded(false);
                }}
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
                onChange={(patch) => q.update(asset.id, patch)}
                onRemove={() => q.remove(asset.id)}
                onUnpair={() => q.unpair(asset.id)}
                onPairInto={(sourceId) => q.pairInto(sourceId, asset.id)}
              />
            ))}
          </ul>
        </section>
      ) : (
        !q.busy && (
          <p className="py-6 text-center text-[0.8125rem] text-muted">
            <span className="block font-medium text-foreground">{t("emptyTitle")}</span>
            {t("emptyHint")}
          </p>
        )
      )}

      {hasAssets && (
        <div className="sticky bottom-4 z-20">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-lift backdrop-blur-md">
            <p className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-2">
              <Layers aria-hidden className="size-3.5" strokeWidth={1.9} />
              {t("totalSize", { size: bytes(q.stats.bytes) })}
            </p>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {!allDone && !finishedReal && (
                <Select
                  label={t("modeLabel")}
                  hideLabel
                  className="w-[12rem]"
                  value={mode}
                  disabled={q.running}
                  onChange={(e) => setMode(e.target.value)}
                  options={RUN_MODES.map((m) => ({
                    value: m.id,
                    label: `${t("modeLabel")}: ${tModes(m.id)}`,
                  }))}
                />
              )}

              {!real && (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted">
                  <FlaskConical aria-hidden className="size-3" strokeWidth={2} />
                  {t("real.simulated")}
                </span>
              )}

              {allDone || finishedReal ? (
                <Link
                  href={realRun ? `/batches/${realRun.batchId}` : "/queue"}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-corroborated px-4 text-[0.8125rem] font-medium text-background"
                >
                  {realRun ? t("real.toBatch") : t("doneCta")}
                  <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => (real ? void startReal() : void q.start(mode))}
                  disabled={q.running || blocking.length > 0 || (real && !labelValid)}
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
                      {real ? (
                        <CloudUpload aria-hidden className="size-3.5" strokeWidth={2.2} />
                      ) : (
                        <Play aria-hidden className="size-3.5" strokeWidth={2.2} />
                      )}
                      {real
                        ? failedCount > 0 && realRun
                          ? t("real.retryCta", { count: failedCount })
                          : t("real.startCta", { count: q.stats.assets })
                        : t("startCta", { count: q.stats.assets })}
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
