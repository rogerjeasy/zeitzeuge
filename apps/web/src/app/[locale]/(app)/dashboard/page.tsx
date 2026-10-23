import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { PageHeader } from "@/components/dashboard/page-header";
import { QueueCallout } from "@/components/dashboard/queue-callout";
import { StatRow } from "@/components/dashboard/stat-row";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { CostPanel } from "@/components/dashboard/cost-panel";
import { RecentRuns } from "@/components/dashboard/recent-runs";

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

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="mx-auto flex w-full max-w-[84rem] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader />
      <QueueCallout />
      <StatRow />

      {/* The trend carries the argument, so it gets the wider column. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <TrendChart />
        <CostPanel />
      </div>

      <RecentRuns />
    </div>
  );
}
