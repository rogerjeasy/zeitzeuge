"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Loader2, Play } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { RECENT_RUNS, type Run, type RunStatus } from "@/lib/data/dashboard";
import { RUN as TRACED_RUN } from "@/lib/data/theater";
import { cn } from "@/lib/cn";

const STATUS_TONE: Record<RunStatus, string> = {
  running: "bg-evidence-soft text-evidence",
  review: "bg-review-soft text-review",
  accepted: "bg-corroborated-soft text-corroborated",
  abstained: "bg-abstain-soft text-abstain",
  failed: "bg-refuted-soft text-refuted",
};

export function RecentRuns() {
  const t = useTranslations("dashboard");
  const tPhotos = useTranslations("archive.photos");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;

  const when = (minutes: number) =>
    minutes < 1
      ? t("justNow")
      : minutes < 60
        ? t("minutesAgo", { count: minutes })
        : t("hoursAgo", { count: Math.round(minutes / 60) });

  return (
    <section className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3.5 sm:px-5">
        <h2 className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong">
          {t("runsTitle")}
        </h2>
        <Link
          href="/history"
          className="inline-flex items-center gap-1.5 text-[0.75rem] text-muted transition-colors duration-150 hover:text-evidence"
        >
          {t("runsAll")}
          <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
        </Link>
      </div>

      {/* Wide screens get a table; narrow screens get stacked cards, because a
          seven-column table on a phone is a horizontal-scroll trap. */}
      <div
        tabIndex={0}
        role="region"
        aria-label={t("runsTitle")}
        className="hidden overflow-x-auto lg:block"
      >
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              {["runsSignature", "runsCollection", "runsStatus", "runsConfidence", "runsDuration", "runsCost", "runsWhen"].map((key, i) => (
                <th
                  key={key}
                  scope="col"
                  className={cn(
                    "px-4 py-2.5 font-mono text-[0.5625rem] font-normal uppercase tracking-[0.12em] text-muted-2",
                    i >= 3 && "text-right",
                  )}
                >
                  {t(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RECENT_RUNS.map((run) => (
              <tr
                key={run.id}
                className="border-b border-line/60 transition-colors duration-150 last:border-0 hover:bg-surface-2/60"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="relative size-8 shrink-0 overflow-hidden rounded-[5px] border border-line">
                      <Image
                        src={run.src}
                        alt={tPhotos(run.photoKey)}
                        fill
                        sizes="32px"
                        className="photo-archival object-cover"
                      />
                    </span>
                    <span className="font-mono text-[0.75rem] text-foreground">{run.signature}</span>
                    {/* Only a run whose full agent trace was retained can be
                        replayed; the rest keep their ledger, not their theatre. */}
                    {run.id === TRACED_RUN.id && (
                      <Link
                        href={`/runs/${run.id}`}
                        title={t("replayRun")}
                        className="grid size-6 shrink-0 place-items-center rounded-md border border-line text-muted-2 transition-colors hover:border-evidence hover:text-evidence"
                      >
                        <Play aria-hidden className="size-3" strokeWidth={2.2} />
                        <span className="sr-only">{t("replayRun")}</span>
                      </Link>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-[0.75rem] text-muted">{run.collection}</td>
                <td className="px-4 py-2.5"><StatusPill status={run.status} /></td>
                <td className="px-4 py-2.5 text-right font-mono text-[0.75rem] tabular-nums text-muted">
                  {run.confidence !== undefined ? run.confidence.toFixed(2) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[0.75rem] tabular-nums text-muted">
                  {t("seconds", { count: run.seconds })}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[0.75rem] tabular-nums text-muted">
                  {new Intl.NumberFormat(intl, { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(run.costUsd)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[0.75rem] text-muted-2">
                  {when(run.minutesAgo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col divide-y divide-line/60 lg:hidden">
        {RECENT_RUNS.map((run) => (
          <li key={run.id} className="flex items-start gap-3 px-4 py-3">
            <span className="relative size-10 shrink-0 overflow-hidden rounded-[5px] border border-line">
              <Image src={run.src} alt={tPhotos(run.photoKey)} fill sizes="40px" className="photo-archival object-cover" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate font-mono text-[0.75rem] text-foreground">
                    {run.signature}
                  </span>
                  {run.id === TRACED_RUN.id && (
                    <Link
                      href={`/runs/${run.id}`}
                      title={t("replayRun")}
                      className="grid size-6 shrink-0 place-items-center rounded-md border border-line text-muted-2 transition-colors hover:border-evidence hover:text-evidence"
                    >
                      <Play aria-hidden className="size-3" strokeWidth={2.2} />
                      <span className="sr-only">{t("replayRun")}</span>
                    </Link>
                  )}
                </span>
                <StatusPill status={run.status} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[0.625rem] text-muted-2">
                <span>{run.collection}</span>
                <span>{t("seconds", { count: run.seconds })}</span>
                {run.confidence !== undefined && <span>{run.confidence.toFixed(2)}</span>}
                <span>{when(run.minutesAgo)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusPill({ status }: { status: Run["status"] }) {
  const t = useTranslations("dashboard.status");

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.08em]",
        STATUS_TONE[status],
      )}
    >
      {status === "running" ? (
        <Loader2 aria-hidden className="size-2.5 animate-spin" strokeWidth={2.5} />
      ) : (
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
      )}
      {t(status)}
    </span>
  );
}
