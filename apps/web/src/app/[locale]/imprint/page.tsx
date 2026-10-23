import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Mail } from "lucide-react";
import { routing } from "@/i18n/routing";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ResourceHero } from "@/components/resources/resource-shell";
import { LegalContent } from "@/components/resources/legal-content";
import { IMPRINT_SECTIONS } from "@/lib/data/legal";
import { CONTACT_EMAIL } from "@/lib/data/about";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "imprint" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function ImprintPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "imprint" });

  return (
    <>
      <SiteHeader />
      <main id="main">
        <ResourceHero
          eyebrow={t("eyebrow")}
          title={t("title")}
          lede={t("lede")}
          facts={[{ label: t("contactLabel"), value: CONTACT_EMAIL }]}
        />
        <LegalContent namespace="imprint" sections={IMPRINT_SECTIONS} />

        <div className="mx-auto w-full max-w-[84rem] px-5 pb-16 sm:px-8 lg:px-12">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 py-3 text-[0.875rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence"
          >
            <Mail aria-hidden className="size-4" strokeWidth={1.9} />
            {CONTACT_EMAIL}
          </a>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
