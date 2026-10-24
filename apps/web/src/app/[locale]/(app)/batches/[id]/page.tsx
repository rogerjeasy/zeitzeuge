import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BatchView } from "@/components/investigation/batch-view";
import { ApiErrorPage } from "@/components/investigation/api-error-page";
import { investigationApi, isUuid, resolveAuth } from "@/lib/api/investigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "investigation.batch" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/** One batch: first paint from the server, then live in the browser. */
export default async function BatchPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!isUuid(id)) notFound();

  const auth = await resolveAuth({ refresh: false });
  if (!auth) return <ApiErrorPage code="unauthenticated" />;
  const result = await investigationApi.batch(auth, id);
  if (!result.ok) {
    if (result.problem.status === 404) notFound();
    return <ApiErrorPage code={result.problem.code} />;
  }
  return <BatchView key={result.data.id} initial={result.data} />;
}
