import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClipboardCheck, Target } from "lucide-react";
import { routing } from "@/i18n/routing";
import { QcPanel } from "@/components/investigation/qc-panel";
import { MeasuredPanel } from "@/components/investigation/measured-panel";
import { ApiNotice } from "@/components/investigation/api-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { loadQcView } from "@/lib/investigation/qc";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "evaluation" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

/**
 * The real Prio-1 QC panel and, once fields have been reviewed, the measured hit
 * rate per field and per confidence band. Nothing invented: before the first
 * review the measurement says it has nothing to measure yet.
 */
export default async function EvaluationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [view, t] = await Promise.all([
    loadQcView(),
    getTranslations({ locale, namespace: "evaluation" }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex min-w-0 flex-col gap-1.5">
        <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
          {t("title")}
        </h1>
        <p className="max-w-[78ch] text-[0.875rem] leading-relaxed text-muted">{t("subtitle")}</p>
      </header>

      {view.error && <ApiNotice code={view.error} />}

      {view.qc ? (
        <QcPanel qc={view.qc} batchId={view.batchId} />
      ) : (
        !view.error && (
          <EmptyState
            icon={ClipboardCheck}
            title={t("qcEmpty.title")}
            body={t("qcEmpty.body")}
            action={{ href: "/upload", label: t("qcEmpty.cta") }}
          />
        )
      )}

      {view.qc?.measured && view.qc.measured.judged > 0 ? (
        <MeasuredPanel measured={view.qc.measured} />
      ) : (
        <EmptyState
          icon={Target}
          tag={t("goldSet.tag")}
          title={t("goldSet.title")}
          body={t("goldSet.body")}
        />
      )}
    </div>
  );
}
