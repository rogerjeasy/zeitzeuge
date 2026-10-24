import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PenLine } from "lucide-react";
import { routing } from "@/i18n/routing";
import { ProfileHeader } from "@/components/profile/profile-header";
import { EmptyState } from "@/components/ui/empty-state";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tApp] = await Promise.all([
    getTranslations({ locale, namespace: "profile" }),
    getTranslations({ locale, namespace: "app" }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
      <ProfileHeader />
      <section className="flex min-w-0 flex-col gap-4">
        <h2 className="font-display text-[1.0625rem] font-semibold tracking-[-0.02em] text-foreground-strong">
          {t("contributionsTitle")}
        </h2>
        <EmptyState
          icon={PenLine}
          tag={tApp("unavailable")}
          title={t("empty.title")}
          body={t("empty.body")}
          action={{ href: "/queue", label: t("empty.cta") }}
        />
      </section>
    </div>
  );
}
