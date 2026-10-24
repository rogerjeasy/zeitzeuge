import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { UploadScreen } from "@/components/upload/upload-screen";
import { investigationApi, resolveAuth } from "@/lib/api/investigation";
import { getCurrentUser } from "@/lib/auth/dal";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "upload" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

/**
 * Whether the real path is open is decided here, not guessed in the browser:
 * the API must answer `GET /batches`, and the account must be allowed to write
 * (the demo guest is read-only). The example seed only appears for an archive
 * with no real batch yet.
 */
export default async function UploadPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [user, auth] = await Promise.all([getCurrentUser(), resolveAuth({ refresh: false })]);
  const batches = auth ? await investigationApi.listBatches(auth) : null;
  const apiProblem = !batches ? "unauthenticated" : batches.ok ? null : batches.problem.code;

  return (
    <UploadScreen
      readOnly={user?.isGuest ?? true}
      apiProblem={apiProblem}
      hasRealBatch={Boolean(batches?.ok && batches.data.length > 0)}
    />
  );
}
