import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { QUEUE_ITEMS } from "@/lib/data/queue";
import { getCaseFile } from "@/lib/data/editor";
import { EditorScreen } from "@/components/editor/editor-screen";

/** Pre-rendered for the ids the queue can actually link to. */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    QUEUE_ITEMS.map((item) => ({ locale, id: item.id })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const record = getCaseFile(id);
  if (!record) return { robots: { index: false, follow: false } };

  const t = await getTranslations({ locale, namespace: "editor" });
  return {
    title: t("metaTitle", { signature: record.signature }),
    robots: { index: false, follow: false },
  };
}

export default async function RecordPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const record = getCaseFile(id);
  if (!record) notFound();

  // Remounting on id keeps the review state from leaking between records.
  return <EditorScreen key={record.id} record={record} />;
}
