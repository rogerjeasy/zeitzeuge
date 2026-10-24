import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BatchList } from "@/components/investigation/batch-list";
import { investigationApi, resolveAuth } from "@/lib/api/investigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "investigation.batches" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/** This archive's batches, newest first — straight from `GET /batches`. */
export default async function BatchesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await resolveAuth({ refresh: false });
  const result = auth
    ? await investigationApi.listBatches(auth)
    : ({ ok: false, problem: { status: 401, code: "unauthenticated", errors: [] } } as const);

  return result.ok ? (
    <BatchList batches={result.data} />
  ) : (
    <BatchList batches={[]} error={result.problem.code} />
  );
}
