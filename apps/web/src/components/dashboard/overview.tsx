import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, ClipboardList, UploadCloud } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { BatchOut, BatchSummary } from "@/lib/api/investigation-types";
import { BATCH_STATUS_KEYS, intlLocale, ARCHIVE_TZ } from "@/components/investigation/labels";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";

/**
 * The archive's real numbers, summed from the batches' own `counts` — the same
 * figures the batch screen and the workbook show, never a second tally.
 */
export async function OverviewTiles({ batches }: { batches: BatchOut[] }) {
  const t = await getTranslations("dashboard.tiles");
  const intl = intlLocale(await getLocale());
  const nf = new Intl.NumberFormat(intl);
  const sum = (key: keyof BatchOut["counts"]) => batches.reduce((n, b) => n + b.counts[key], 0);

  const tiles: { key: string; value: number; tone?: string }[] = [
    { key: "batches", value: batches.length },
    { key: "photos", value: sum("total") },
    { key: "inProgress", value: sum("uploaded") + sum("queued") + sum("running"), tone: "text-evidence" },
    { key: "processed", value: sum("done") },
    { key: "accepted", value: sum("accepted"), tone: "text-corroborated" },
    { key: "review", value: sum("review"), tone: "text-review" },
    { key: "undetermined", value: sum("undetermined"), tone: "text-abstain" },
    { key: "failed", value: sum("failed"), tone: sum("failed") ? "text-refuted" : undefined },
  ];

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.key} className="flex min-w-0 flex-col justify-between gap-1.5 bg-surface px-4 py-3.5">
          <dt className="text-[0.75rem] leading-tight text-muted [overflow-wrap:anywhere]">{t(tile.key)}</dt>
          <dd
            className={cn(
              "font-display text-[1.5rem] font-semibold leading-none tabular-nums tracking-[-0.02em]",
              tile.tone ?? "text-foreground-strong",
            )}
          >
            {nf.format(tile.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** How many photographs wait for a human, with the way to them. */
export async function ReviewCallout({ count }: { count: number }) {
  const t = await getTranslations("dashboard");
  return (
    <section
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3.5",
        count > 0 ? "border-review/35 bg-review-soft" : "border-line bg-surface",
      )}
    >
      <ClipboardList
        aria-hidden
        className={cn("size-4 shrink-0", count > 0 ? "text-review" : "text-muted-2")}
        strokeWidth={1.9}
      />
      <p
        className={cn(
          "min-w-0 flex-1 text-[0.875rem] font-medium",
          count > 0 ? "text-review" : "text-foreground",
        )}
      >
        {t("reviewTitle", { count })}
      </p>
      {count > 0 && (
        <Link
          href="/queue"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[0.8125rem] font-medium text-background transition-colors hover:bg-foreground-strong"
        >
          {t("reviewCta")}
          <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
        </Link>
      )}
    </section>
  );
}

/** The newest batches, straight from `GET /batches`. */
export async function RecentBatches({ batches }: { batches: BatchSummary[] }) {
  const t = await getTranslations("dashboard");
  const tb = await getTranslations("investigation.batch");
  const tl = await getTranslations("investigation.batches");
  const intl = intlLocale(await getLocale());
  const time = (iso: string) =>
    new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeStyle: "short", timeZone: ARCHIVE_TZ }).format(
      new Date(iso),
    );

  return (
    <section className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong">
          {t("recentTitle")}
        </h2>
        <Link href="/batches" className="text-[0.75rem] font-medium text-evidence hover:underline">
          {t("recentAll")}
        </Link>
      </header>
      {batches.length === 0 ? (
        <EmptyState
          size="inline"
          icon={UploadCloud}
          title={t("empty.title")}
          body={t("empty.body")}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {batches.slice(0, 5).map((b) => (
            <li key={b.id}>
              <Link
                href={`/batches/${b.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 transition-colors hover:bg-surface-2/60 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto] sm:px-5"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-mono text-[0.8125rem] font-medium text-foreground-strong">
                    {b.label ?? tb("unlabelled")}
                  </span>
                  <span className="truncate text-[0.6875rem] text-muted">{tb("created", { time: time(b.created_at) })}</span>
                </span>
                <span className="hidden font-mono text-[0.75rem] tabular-nums text-foreground sm:block">
                  {tl("photos", { count: b.asset_count })}
                </span>
                <span className="hidden text-[0.75rem] text-muted sm:block">
                  {BATCH_STATUS_KEYS.has(b.status) ? tb(`batchStatus.${b.status}`) : b.status}
                </span>
                <ArrowRight aria-hidden className="size-4 text-muted-2" strokeWidth={2} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
