import { useTranslations } from "next-intl";
import { Mountain, CalendarRange, PenLine, Info } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";
import { TerrainSchematic } from "./capabilities/terrain-schematic";
import { ChronologyTimeline } from "./capabilities/chronology-timeline";
import { VersoPanel } from "./capabilities/verso-panel";
import { cn } from "@/lib/cn";

const ITEMS = [
  { id: "terrain", Icon: Mountain, accent: "text-evidence", soft: "bg-evidence-soft", Demo: TerrainSchematic },
  { id: "chronology", Icon: CalendarRange, accent: "text-review", soft: "bg-review-soft", Demo: ChronologyTimeline },
  { id: "verso", Icon: PenLine, accent: "text-sepia", soft: "bg-sepia-soft", Demo: VersoPanel },
] as const;

export function CapabilitiesSection() {
  const t = useTranslations("capabilities");

  return (
    <Section id="capabilities" tone="raised">
      <SectionHeading
        eyebrow={<Eyebrow>{t("eyebrow")}</Eyebrow>}
        title={t("title")}
      />

      <div className="mt-12 flex flex-col gap-14 sm:mt-14 sm:gap-20">
        {ITEMS.map(({ id, Icon, accent, soft, Demo }, index) => (
          <Reveal key={id}>
            <article
              className={cn(
                "grid items-center gap-8 lg:grid-cols-2 lg:gap-14",
                // alternate sides so the eye zig-zags down the page
                index % 2 === 1 && "lg:[&>*:first-child]:order-2",
              )}
            >
              <div className="flex min-w-0 flex-col gap-5">
                <div className="flex items-center gap-3">
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", soft, accent)}>
                    <Icon aria-hidden className="size-5" strokeWidth={1.8} />
                  </span>
                  <span className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted-2">
                    {String(index + 1).padStart(2, "0")} / 03
                  </span>
                </div>

                <div className="flex flex-col gap-2.5">
                  <h3 className="font-display text-[clamp(1.375rem,1.1rem+1.1vw,1.875rem)] font-semibold leading-tight tracking-[-0.025em] text-foreground-strong">
                    {t(`items.${id}.name`)}
                  </h3>
                  <p className={cn("font-display text-[0.9375rem] italic leading-snug", accent)}>
                    {t(`items.${id}.tagline`)}
                  </p>
                </div>

                <p className="max-w-[56ch] text-[0.875rem] leading-[1.8] text-muted">
                  {t(`items.${id}.body`)}
                </p>

                {/* Stating the limit is a credibility move, so it gets a box, not a footnote. */}
                <div className="flex gap-2.5 rounded-lg border border-dashed border-line-strong bg-surface/50 px-3.5 py-3">
                  <Info aria-hidden className="mt-px size-3.5 shrink-0 text-muted-2" strokeWidth={2} />
                  <div className="min-w-0">
                    <p className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
                      {t(`items.${id}.limitTitle`)}
                    </p>
                    <p className="mt-1 text-[0.75rem] leading-[1.7] text-muted">
                      {t(`items.${id}.limit`)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <Demo />
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
