import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BatchView } from "@/components/investigation/batch-view";
import { ApiErrorPage } from "@/components/investigation/api-error-page";
import { investigationApi, isUuid, resolveAuth } from "@/lib/api/investigation";
import { parseFilter } from "@/lib/investigation/batch-filter";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "investigation.batch" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * One batch: first paint from the server, then live in the browser. The
 * filter (`?status=…&qc=…&q=…&sort=…`) and the Papierkorb (`?trash=1`) come
 * from the URL, so a shared link opens the same view.
 */
export default async function BatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const filter = parseFilter(query);
  const trash = query.trash === "1";

  const auth = await resolveAuth({ refresh: false });
  if (!auth) return <ApiErrorPage code="unauthenticated" />;
  const result = await investigationApi.batch(auth, id, { includeDeleted: trash });
  if (!result.ok) {
    if (result.problem.status === 404) notFound();
    return <ApiErrorPage code={result.problem.code} />;
  }
  return (
    <BatchView key={result.data.id} initial={result.data} initialFilter={filter} initialTrash={trash} />
  );
}
