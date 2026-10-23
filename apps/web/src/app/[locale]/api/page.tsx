import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ResourceHero } from "@/components/resources/resource-shell";
import { ApiContent } from "@/components/resources/api-content";
import { API_BASE, API_VERSION } from "@/lib/data/reference";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "api" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function ApiPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "api" });

  return (
    <>
      <SiteHeader />
      <main id="main">
        <ResourceHero
          eyebrow={t("eyebrow")}
          title={t("title")}
          lede={t("lede")}
          facts={[
            { label: t("facts.baseUrl"), value: API_BASE },
            { label: t("facts.version"), value: API_VERSION },
            { label: t("facts.format"), value: "application/json" },
            { label: t("facts.auth"), value: t("authValue") },
          ]}
        />
        <ApiContent />
      </main>
      <SiteFooter />
    </>
  );
}
