import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Coins } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ApiNotice } from "@/components/investigation/api-notice";
import { CostDashboard } from "@/components/costs/cost-dashboard";
import { investigationApi, resolveAuth } from "@/lib/api/investigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "costs" });
  return { title: t("metaTitle"), description: t("metaDescription"), robots: { index: false, follow: false } };
}

const PERIODS = new Set([7, 30, 90]);

/** What the investigation costs, from the recorded model calls: `GET /costs`. */
export default async function CostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "costs" });
  const requested = Number(Array.isArray(query.days) ? query.days[0] : query.days);
  const days = PERIODS.has(requested) ? requested : null;
  const auth = await resolveAuth({ refresh: false });
  const result = auth
    ? await investigationApi.costs(auth, days)
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
      {result.ok && result.data.totals.calls > 0 ? (
        <CostDashboard report={result.data} />
      ) : (
        result.ok && (
          <EmptyState
            icon={Coins}
            title={t("empty.title")}
            body={t("empty.body")}
            action={{ href: "/upload", label: t("empty.cta") }}
          />
        )
      )}
    </div>
  );
}
