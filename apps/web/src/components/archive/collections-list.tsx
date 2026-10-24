import { useLocale, useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Collection } from "@/lib/api/investigation-types";
import { intlLocale } from "@/components/investigation/labels";

/** Each fonds and how far it is described, from the records themselves. */
export function CollectionsList({ collections }: { collections: Collection[] }) {
  const t = useTranslations("collections");
  const intl = intlLocale(useLocale());
  const pct = (part: number, whole: number) =>
    new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 0 }).format(whole ? part / whole : 0);

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {collections.map((c) => {
        const bars = [
          { key: "investigated", value: c.investigated, tone: "bg-evidence" },
          { key: "described", value: c.described, tone: "bg-corroborated" },
          { key: "reviewed", value: c.reviewed, tone: "bg-review" },
        ] as const;
        return (
          <li key={c.id} className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-mono text-[0.6875rem] text-muted">{c.reference_code}</p>
              <h2 className="font-display text-[1rem] font-semibold tracking-[-0.01em] text-foreground-strong">{c.title}</h2>
              {c.scope_note && <p className="text-[0.75rem] leading-relaxed text-muted">{c.scope_note}</p>}
            </div>
            <p className="text-[0.8125rem] text-foreground">
              {t("counts", { photos: c.photos, batches: c.batches })}
            </p>
            <ul className="flex flex-col gap-2">
              {bars.map((bar) => (
                <li key={bar.key} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_5.5rem] items-center gap-3 text-[0.75rem]">
                  <span className="truncate text-foreground">{t(`bars.${bar.key}`)}</span>
                  <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-line-strong/40">
                    <span className={`block h-full rounded-full ${bar.tone}`} style={{ width: `${c.photos ? Math.min(bar.value / c.photos, 1) * 100 : 0}%` }} />
                  </span>
                  <span className="text-right font-mono tabular-nums text-muted">
                    {bar.value} · {pct(bar.value, c.photos)}
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/batches" className="inline-flex items-center gap-1 self-start text-[0.75rem] font-medium text-evidence hover:underline">
              {t("toBatches")}
              <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
