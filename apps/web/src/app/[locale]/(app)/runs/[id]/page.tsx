import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Workflow } from "lucide-react";
import { UnavailablePage } from "@/components/ui/empty-state";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "theater" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

/**
 * The step-by-step replay of one investigation has no data source yet. The
 * steps a run took are on the photograph's own record, so this points there.
 */
export default async function RunPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tApp] = await Promise.all([
    getTranslations({ locale, namespace: "theater" }),
    getTranslations({ locale, namespace: "app" }),
  ]);
  return (
    <UnavailablePage
      heading={t("title")}
      icon={Workflow}
      tag={tApp("unavailable")}
      title={t("empty.title")}
      body={t("empty.body")}
      action={{ href: "/batches", label: t("empty.cta") }}
    />
  );
}
