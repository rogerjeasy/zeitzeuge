import type { Metadata } from "next";
import { cache } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FileQuestion } from "lucide-react";
import { investigationApi, isUuid, resolveAuth } from "@/lib/api/investigation";
import { CaseScreen } from "@/components/investigation/case-screen";
import { ApiErrorPage } from "@/components/investigation/api-error-page";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * One photograph's catalogue record, rendered from `GET /assets/{id}/case` at
 * request time. Only real asset ids exist here; anything else is «not found».
 */

/** One `/case` call per render, shared by the metadata and the page. */
const loadCase = cache(async (id: string) => {
  const auth = await resolveAuth({ refresh: false });
  if (!auth) return { ok: false, problem: { status: 401, code: "unauthenticated", errors: [] } } as const;
  return investigationApi.caseFile(auth, id);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "editor" });
  const result = isUuid(id) ? await loadCase(id) : null;
  return {
    title: result?.ok ? t("metaTitle", { signature: result.data.external_ref }) : t("notFound.metaTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function RecordPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const result = isUuid(id) ? await loadCase(id) : null;
  if (!result || (!result.ok && result.problem.status === 404)) {
    const t = await getTranslations({ locale, namespace: "editor.notFound" });
    return (
      <div className="mx-auto flex w-full max-w-[56rem] flex-col px-4 py-8 sm:px-6">
        <EmptyState
          icon={FileQuestion}
          title={t("title")}
          body={t("body")}
          action={{ href: "/batches", label: t("cta") }}
          secondary={{ href: "/queue", label: t("toQueue") }}
        />
      </div>
    );
  }
  if (!result.ok) return <ApiErrorPage code={result.problem.code} />;
  return <CaseScreen key={result.data.asset_id} initial={result.data} />;
}
