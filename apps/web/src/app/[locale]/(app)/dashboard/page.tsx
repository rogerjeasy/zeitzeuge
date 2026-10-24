import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { UploadCloud } from "lucide-react";
import { routing } from "@/i18n/routing";
import { PageHeader } from "@/components/dashboard/page-header";
import { OverviewTiles, RecentBatches, ReviewCallout } from "@/components/dashboard/overview";
import { QcCounter } from "@/components/investigation/qc-counter";
import { ApiNotice } from "@/components/investigation/api-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { loadQcView } from "@/lib/investigation/qc";
import { loadArchiveOverview, reviewItems } from "@/lib/investigation/overview";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

/** Real numbers only: batches, photographs, verdicts, QC. Nothing invented. */
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [overview, qc, t] = await Promise.all([
    loadArchiveOverview(),
    loadQcView(),
    getTranslations({ locale, namespace: "dashboard" }),
  ]);
  const empty = overview.ok && overview.summaries.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-[84rem] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader />

      {!overview.ok ? (
        <ApiNotice code={overview.code} />
      ) : empty ? (
        <EmptyState
          icon={UploadCloud}
          title={t("empty.title")}
          body={t("empty.body")}
          action={{ href: "/upload", label: t("empty.cta") }}
        />
      ) : (
        <>
          <ReviewCallout count={reviewItems(overview.batches).length} />
          <OverviewTiles batches={overview.batches} />
          {qc.qc && <QcCounter qc={qc.qc} />}
          <RecentBatches batches={overview.summaries} />
        </>
      )}
    </div>
  );
}
