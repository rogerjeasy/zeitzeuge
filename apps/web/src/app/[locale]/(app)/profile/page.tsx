import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ContributionStats } from "@/components/profile/contribution-stats";
import { RecentCorrections } from "@/components/profile/recent-corrections";

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

  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
      <ProfileHeader />
      <ContributionStats />
      <RecentCorrections />
    </div>
  );
}
