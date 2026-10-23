import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ResourceHero } from "@/components/resources/resource-shell";
import { ContactForm } from "@/components/contact/contact-form";
import { ContactAside } from "@/components/contact/contact-aside";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "contact" });

  return (
    <>
      <SiteHeader />
      <main id="main">
        <ResourceHero eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />

        <div className="mx-auto w-full max-w-[84rem] px-5 py-12 sm:px-8 sm:py-16 lg:px-12">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-10 lg:items-start">
            <ContactForm />
            <ContactAside />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
