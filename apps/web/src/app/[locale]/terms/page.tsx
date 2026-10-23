import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ResourceHero } from "@/components/resources/resource-shell";
import { LegalContent } from "@/components/resources/legal-content";
import { TERMS_SECTIONS } from "@/lib/data/legal";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "terms" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "terms" });

  return (
    <>
      <SiteHeader />
      <main id="main">
        <ResourceHero eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
        <LegalContent namespace="terms" sections={TERMS_SECTIONS} />
      </main>
      <SiteFooter />
    </>
  );
}
