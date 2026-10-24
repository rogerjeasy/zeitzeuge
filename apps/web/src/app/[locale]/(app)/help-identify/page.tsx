import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HandHelping } from "lucide-react";
import { routing } from "@/i18n/routing";
import { UnavailablePage } from "@/components/ui/empty-state";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "assist" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

/** No data source for this screen yet: an honest empty state, not an example. */
export default async function AssistPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tApp] = await Promise.all([
    getTranslations({ locale, namespace: "assist" }),
    getTranslations({ locale, namespace: "app" }),
  ]);
  return (
    <UnavailablePage
      heading={t("title")}
      subtitle={t("subtitle")}
      icon={HandHelping}
      tag={tApp("unavailable")}
      title={t("empty.title")}
      body={t("empty.body")}
      action={{ href: "/queue", label: t("empty.cta") }}
    />
  );
}
