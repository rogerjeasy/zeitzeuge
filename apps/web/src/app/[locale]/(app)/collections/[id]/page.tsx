import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { DIGITISED, getFonds } from "@/lib/data/collections";
import { FondsScreen } from "@/components/collections/fonds-screen";

/** Only the fonds that hold scans have anything to show. */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    DIGITISED.map((fonds) => ({ locale, id: fonds.id })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const found = getFonds(id);
  if (!found) return { robots: { index: false, follow: false } };

  const t = await getTranslations({ locale, namespace: "collections" });
  return {
    title: `${found.fonds.name} — ZEITZEUGE`,
    description: t(`fonds.${found.fonds.scopeKey}`),
    robots: { index: false, follow: false },
  };
}

export default async function FondsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const found = getFonds(id);
  if (!found || !found.stats) notFound();

  return <FondsScreen fonds={found.fonds} stats={found.stats} />;
}
