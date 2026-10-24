import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { QUEUE_ITEMS } from "@/lib/data/queue";
import { getCaseFile } from "@/lib/data/editor";
import { investigationApi, isUuid, resolveAuth } from "@/lib/api/investigation";
import { EditorScreen } from "@/components/editor/editor-screen";
import { CaseScreen } from "@/components/investigation/case-screen";
import { ApiErrorPage } from "@/components/investigation/api-error-page";

/**
 * Two kinds of id reach this route.
 *
 * - An asset UUID: a real investigation, rendered from `GET /assets/{id}/case`
 *   at request time (`dynamicParams` stays on, so these are never prebuilt).
 * - A demo id (`q1`…): the labelled example editor on mock data, prebuilt for
 *   the ids the example queue links to.
 */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    QUEUE_ITEMS.map((item) => ({ locale, id: item.id })),
  );
}

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

  if (isUuid(id)) {
    const result = await loadCase(id);
    return {
      title: t("metaTitle", { signature: result.ok ? result.data.external_ref : id.slice(0, 8) }),
      robots: { index: false, follow: false },
    };
  }

  const record = getCaseFile(id);
  if (!record) return { robots: { index: false, follow: false } };
  return {
    title: t("metaTitle", { signature: record.signature }),
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

  if (isUuid(id)) {
    const result = await loadCase(id);
    if (!result.ok) {
      if (result.problem.status === 404) notFound();
      return <ApiErrorPage code={result.problem.code} />;
    }
    return <CaseScreen key={result.data.asset_id} initial={result.data} />;
  }

  const record = getCaseFile(id);
  if (!record) notFound();

  // Remounting on id keeps the review state from leaking between records.
  return <EditorScreen key={record.id} record={record} />;
}
