import { useLocale, useTranslations } from "next-intl";
import { Bot, UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { HistoryEntry } from "@/lib/api/investigation-types";
import { cn } from "@/lib/cn";
import { ARCHIVE_TZ, intlLocale } from "@/components/investigation/labels";

const KNOWN_ACTIONS = new Set([
  "run_finished",
  "record_field_reviewed",
  "record_bulk_accepted",
  "asset_uploaded",
  "batch_created",
  "asset_withdrawn",
  "asset_restored",
  "batch_withdrawn",
  "batch_restored",
  "batch_exported",
  "batch_mirrored",
  "runs_purged_failed",
]);
const FIELD_KEYS = new Set(["locality", "municipality", "building", "landscape_feature", "street"]);
const REVIEW_KEYS = new Set(["accept", "correct", "reject"]);
const RUN_KEYS = new Set(["awaiting_review", "accepted", "abstained", "failed", "cancelled", "superseded"]);

/**
 * The archive's trail of work, grouped by day (Europe/Zurich). Machine runs and
 * human actions side by side; every row links to the photo or batch it touched.
 */
export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  const t = useTranslations("history");
  const tf = useTranslations("investigation.fields");
  const intl = intlLocale(useLocale());
  const day = new Intl.DateTimeFormat(intl, { timeZone: ARCHIVE_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const time = new Intl.DateTimeFormat(intl, { timeZone: ARCHIVE_TZ, hour: "2-digit", minute: "2-digit" });

  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const key = day.format(new Date(entry.at));
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const what = (e: HistoryEntry) => {
    const key = e.action.replaceAll(".", "_");
    const action = KNOWN_ACTIONS.has(key) ? t(`actions.${key}`, { count: e.count ?? 0 }) : e.action;
    const extra: string[] = [];
    if (e.field && FIELD_KEYS.has(e.field)) extra.push(tf(e.field));
    if (e.detail && e.action === "record.field_reviewed" && REVIEW_KEYS.has(e.detail)) extra.push(t(`review.${e.detail}`));
    if (e.detail && e.action === "run.finished" && RUN_KEYS.has(e.detail)) extra.push(t(`run.${e.detail}`));
    return { action, extra: extra.join(" · ") };
  };

  return (
    <div className="flex flex-col gap-5">
      {[...groups.entries()].map(([label, rows]) => (
        <section key={label} className="flex flex-col gap-2">
          <h2 className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-2">{label}</h2>
          <ol className="flex flex-col divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {rows.map((e, i) => {
              const { action, extra } = what(e);
              const target = e.asset_id ? `/records/${e.asset_id}` : e.batch_id ? `/batches/${e.batch_id}` : null;
              const Icon = e.actor_kind === "machine" ? Bot : UserRound;
              return (
                <li key={`${e.at}-${i}`} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3 px-3.5 py-2.5 sm:grid-cols-[3.25rem_minmax(0,12rem)_minmax(0,1fr)]">
                  <time dateTime={e.at} className="font-mono text-[0.75rem] tabular-nums text-muted">
                    {time.format(new Date(e.at))}
                  </time>
                  <span className={cn("hidden min-w-0 items-center gap-1.5 truncate text-[0.8125rem] sm:flex", e.actor_kind === "machine" ? "text-evidence" : "text-foreground")}>
                    <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
                    <span className="truncate">{e.actor}</span>
                  </span>
                  <div className="col-start-2 flex min-w-0 flex-col gap-0.5 sm:col-start-3">
                    <p className="text-[0.8125rem] text-foreground">
                      <span className="sm:hidden">{e.actor} · </span>
                      {action}
                      {extra && <span className="text-muted"> · {extra}</span>}
                    </p>
                    {(e.photo || e.batch) && (
                      <p className="truncate text-[0.75rem] text-muted">
                        {target ? (
                          <Link href={target} className="font-mono text-evidence hover:underline">
                            {e.photo ?? e.batch}
                          </Link>
                        ) : (
                          <span className="font-mono">{e.photo ?? e.batch}</span>
                        )}
                        {e.photo && e.batch && <span> · {t("inBatch", { batch: e.batch })}</span>}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
