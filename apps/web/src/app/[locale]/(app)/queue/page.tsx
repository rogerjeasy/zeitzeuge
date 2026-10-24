import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckCheck, UploadCloud } from "lucide-react";
import { QueueView } from "@/components/investigation/queue-view";
import { ApiNotice } from "@/components/investigation/api-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { loadArchiveOverview, reviewItems } from "@/lib/investigation/overview";
import { QUEUE_DEFAULT_FILTER, parseFilter } from "@/lib/investigation/batch-filter";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "queue" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

/**
 * The review list: every photograph, across all batches, whose head record
 * says «Prüfbedarf» or whose QC status is «offen» — least certain first,
 * unless the URL's filter says otherwise.
 */
export default async function QueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const filter = parseFilter(await searchParams, QUEUE_DEFAULT_FILTER);
  const [overview, t] = await Promise.all([
    loadArchiveOverview(),
    getTranslations({ locale, namespace: "queue" }),
  ]);
  const items = overview.ok ? reviewItems(overview.batches) : [];

  return (
    <div className="mx-auto flex w-full max-w-[84rem] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex min-w-0 flex-col gap-1.5">
        <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
          {t("title")}
        </h1>
        <p className="max-w-[78ch] text-[0.875rem] text-muted">{t("subtitle")}</p>
      </header>

      {!overview.ok ? (
        <ApiNotice code={overview.code} />
      ) : overview.summaries.length === 0 ? (
        <EmptyState
          icon={UploadCloud}
          title={t("noBatches.title")}
          body={t("noBatches.body")}
          action={{ href: "/upload", label: t("noBatches.cta") }}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={CheckCheck}
          title={t("empty.title")}
          body={t("empty.body")}
          action={{ href: "/batches", label: t("empty.cta") }}
        />
      ) : (
        <QueueView
          heading={t("title")}
          initialFilter={filter}
          items={items}
        />
      )}
    </div>
  );
}
