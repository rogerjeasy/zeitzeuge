import type { Metadata } from "next";
import { cache } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FileQuestion } from "lucide-react";
import { investigationApi, isUuid, resolveAuth, type ApiAuth } from "@/lib/api/investigation";
import { applyFilter } from "@/lib/investigation/batch-filter";
import { loadArchiveOverview, reviewItems } from "@/lib/investigation/overview";
import {
  locate,
  originFilter,
  parseOrigin,
  type ReviewNav,
  type ReviewOrigin,
} from "@/lib/investigation/review-nav";
import type { BatchFilter } from "@/lib/investigation/batch-filter";
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

/**
 * The list the archivist came from, in its filter and sort, and where this
 * photo sits in it. Null when there is no origin or the list cannot be read:
 * the screen then simply has no previous / next.
 */
async function loadNav(
  auth: ApiAuth | null,
  origin: ReviewOrigin | null,
  filter: BatchFilter,
  assetId: string,
): Promise<ReviewNav | null> {
  if (!auth || !origin) return null;
  let assets;
  if (origin.kind === "batch") {
    const batch = await investigationApi.batch(auth, origin.batchId);
    if (!batch.ok) return null;
    assets = batch.data.assets;
  } else {
    const overview = await loadArchiveOverview();
    if (!overview.ok) return null;
    assets = reviewItems(overview.batches).map((i) => i.asset);
  }
  const ids = applyFilter(assets, filter).map((a) => a.asset_id);
  return { origin, filter, ...locate(ids, assetId) };
}

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
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const origin = parseOrigin(query);
  const filter = originFilter(query, origin);

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
  const nav = await loadNav(await resolveAuth({ refresh: false }), origin, filter, result.data.asset_id);
  return <CaseScreen key={result.data.asset_id} initial={result.data} nav={nav} />;
}
