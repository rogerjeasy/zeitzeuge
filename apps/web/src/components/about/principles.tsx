import { useTranslations } from "next-intl";
import { FileCheck2, Gauge, Mountain, Scroll } from "lucide-react";
import { PRINCIPLES } from "@/lib/data/about";

const ICONS = {
  evidence: FileCheck2,
  terrain: Mountain,
  calibration: Gauge,
  provenance: Scroll,
} as const;

/**
 * Four commitments, at the length they deserve.
 *
 * These are the claims the product is judged on, so they get paragraphs rather
 * than bullets — a principle compressed to six words is a slogan, and a slogan
 * is exactly what an archive has learned to distrust.
 */
export function Principles() {
  const t = useTranslations("about");

  return (
    <section className="border-b border-line">
      <div className="mx-auto flex w-full max-w-[84rem] flex-col gap-8 px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="flex max-w-[64ch] flex-col gap-3">
          <h2 className="font-display text-[clamp(1.5rem,1.2rem+1.4vw,2.25rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
            {t("principlesTitle")}
          </h2>
          <p className="text-[0.9375rem] leading-relaxed text-muted">{t("principlesLede")}</p>
        </div>

        <ul className="grid gap-4 md:grid-cols-2">
          {PRINCIPLES.map((principle) => {
            const Icon = ICONS[principle.icon];
            return (
              <li
                key={principle.id}
                className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-evidence-soft text-evidence">
                  <Icon aria-hidden className="size-5" strokeWidth={1.8} />
                </span>
                <h3 className="font-display text-[1.0625rem] font-semibold tracking-[-0.015em] text-foreground-strong">
                  {t(`principles.${principle.id}.title`)}
                </h3>
                <p className="text-[0.875rem] leading-[1.75] text-muted">
                  {t(`principles.${principle.id}.body`)}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
