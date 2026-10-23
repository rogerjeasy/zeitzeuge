import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { RUN } from "@/lib/data/theater";
import { TheaterScreen } from "@/components/theater/theater-screen";

/** One run is replayable; the rest of the run log lives in the history trail. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale, id: RUN.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "theater" });
  return {
    title: t("metaTitle", { run: id }),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

export default async function RunPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (id !== RUN.id) notFound();
  return <TheaterScreen />;
}
