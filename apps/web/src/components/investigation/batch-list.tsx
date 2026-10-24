import { getTranslations } from "next-intl/server";
import { Eye, EyeOff, UploadCloud } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import type { BatchSummary } from "@/lib/api/investigation-types";
import { cn } from "@/lib/cn";
import { ApiNotice } from "./api-notice";
import { BatchTable } from "./batch-table";

/**
 * The archive's batches (`GET /batches`). Server-rendered; nothing here is
 * simulated. Archivists and admins also see «Entfernte Stapel anzeigen»
 * (`?removed=1` → `include_deleted=true`) and the per-batch remove/restore.
 */
export async function BatchList({
  batches,
  error,
  canApprove = false,
  showRemoved = false,
}: {
  batches: BatchSummary[];
  error?: string;
  canApprove?: boolean;
  showRemoved?: boolean;
}) {
  const t = await getTranslations("investigation.batches");
  const tm = await getTranslations("investigation.manage");

  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
            {t("title")}
          </h1>
          <p className="max-w-[72ch] text-[0.875rem] text-muted">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canApprove && (
            <Link
              href={showRemoved ? "/batches" : "/batches?removed=1"}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-[0.8125rem] font-medium transition-colors",
                showRemoved
                  ? "border-foreground bg-foreground text-background"
                  : "border-line-strong bg-surface text-foreground hover:border-evidence hover:text-evidence",
              )}
            >
              {showRemoved ? (
                <EyeOff aria-hidden className="size-4" strokeWidth={2} />
              ) : (
                <Eye aria-hidden className="size-4" strokeWidth={2} />
              )}
              {showRemoved ? tm("hideRemoved") : tm("showRemoved")}
            </Link>
          )}
          <Link
            href="/upload"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-[0.8125rem] font-medium text-background transition-colors hover:bg-foreground-strong"
          >
            <UploadCloud aria-hidden className="size-4" strokeWidth={2} />
            {t("newBatch")}
          </Link>
        </div>
      </header>

      {error && <ApiNotice code={error} />}

      {batches.length === 0 ? (
        !error && (
          <EmptyState
            icon={UploadCloud}
            title={t("emptyTitle")}
            body={t("emptyBody")}
            action={{ href: "/upload", label: t("newBatch") }}
          />
        )
      ) : (
        <BatchTable batches={batches} canApprove={canApprove} />
      )}
    </div>
  );
}
