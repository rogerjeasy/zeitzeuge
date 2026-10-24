import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BatchList } from "@/components/investigation/batch-list";
import { investigationApi, resolveAuth } from "@/lib/api/investigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { capabilitiesFor } from "@/lib/investigation/permissions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "investigation.batches" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * This archive's batches, newest first — straight from `GET /batches`.
 * `?removed=1` adds the removed ones, for the roles that may restore them.
 */
export default async function BatchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [user, query] = await Promise.all([getCurrentUser(), searchParams]);
  const { canApprove } = capabilitiesFor(user?.role);
  const showRemoved = canApprove && query.removed === "1";

  const auth = await resolveAuth({ refresh: false });
  const result = auth
    ? await investigationApi.listBatches(auth, { includeDeleted: showRemoved })
    : ({ ok: false, problem: { status: 401, code: "unauthenticated", errors: [] } } as const);

  return result.ok ? (
    <BatchList batches={result.data} canApprove={canApprove} showRemoved={showRemoved} />
  ) : (
    <BatchList batches={[]} error={result.problem.code} canApprove={canApprove} showRemoved={showRemoved} />
  );
}
