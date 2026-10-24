import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Layers, UploadCloud } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { BatchSummary } from "@/lib/api/investigation-types";
import { ApiNotice } from "./api-notice";
import { BATCH_STATUS_KEYS, intlLocale, ARCHIVE_TZ } from "./labels";

/** The archive's batches (`GET /batches`). Server-rendered; nothing here is simulated. */
export async function BatchList({ batches, error }: { batches: BatchSummary[]; error?: string }) {
  const t = await getTranslations("investigation.batches");
  const tb = await getTranslations("investigation.batch");
  const intl = intlLocale(await getLocale());
  const time = (iso: string) =>
    new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeStyle: "short", timeZone: ARCHIVE_TZ }).format(new Date(iso));

  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
            {t("title")}
          </h1>
          <p className="max-w-[72ch] text-[0.875rem] text-muted">{t("subtitle")}</p>
        </div>
        <Link
          href="/upload"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-[0.8125rem] font-medium text-background transition-colors hover:bg-foreground-strong"
        >
          <UploadCloud aria-hidden className="size-4" strokeWidth={2} />
          {t("newBatch")}
        </Link>
      </header>

      {error && <ApiNotice code={error} />}

      {batches.length === 0 ? (
        !error && (
          <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface-2/40 px-6 py-12 text-center">
            <Layers aria-hidden className="size-6 text-muted-2" strokeWidth={1.8} />
            <p className="font-medium text-foreground-strong">{t("emptyTitle")}</p>
            <p className="max-w-[54ch] text-[0.8125rem] text-muted">{t("emptyBody")}</p>
          </div>
        )
      ) : (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          {batches.map((b) => (
            <li key={b.id}>
              <Link
                href={`/batches/${b.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 transition-colors hover:bg-surface-2/60 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto]"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-mono text-[0.875rem] font-medium text-foreground-strong">
                    {b.label ?? tb("unlabelled")}
                  </span>
                  <span className="text-[0.75rem] text-muted">
                    {tb("created", { time: time(b.created_at) })}
                    {b.mirrored_from && <> · {t("mirror")}</>}
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
