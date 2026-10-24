import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { History } from "lucide-react";
import { routing } from "@/i18n/routing";
import { EmptyState } from "@/components/ui/empty-state";
import { ApiNotice } from "@/components/investigation/api-notice";
import { HistoryList } from "@/components/archive/history-list";
import { investigationApi, resolveAuth } from "@/lib/api/investigation";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "history" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

/** Who investigated, reviewed or corrected which photo, and when: `GET /history`, archive work only. */
export default async function HistoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "history" });
  const auth = await resolveAuth({ refresh: false });
  const result = auth
    ? await investigationApi.history(auth)
    : ({ ok: false, problem: { status: 401, code: "unauthenticated", errors: [] } } as const);

  return (
    <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex min-w-0 flex-col gap-1.5">
        <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
          {t("title")}
        </h1>
        <p className="max-w-[78ch] text-[0.875rem] leading-relaxed text-muted">{t("subtitle")}</p>
      </header>
      {!result.ok && <ApiNotice code={result.problem.code} />}
      {result.ok && result.data.length > 0 ? (
        <HistoryList entries={result.data} />
      ) : (
        result.ok && (
          <EmptyState
            icon={History}
            title={t("empty.title")}
            body={t("empty.body")}
            action={{ href: "/batches", label: t("empty.cta") }}
          />
        )
      )}
    </div>
  );
}
