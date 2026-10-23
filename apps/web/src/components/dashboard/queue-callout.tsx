import { useTranslations } from "next-intl";
import { ArrowRight, Clock, Gauge } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { REVIEW_QUEUE } from "@/lib/data/dashboard";

/**
 * The screen opens on this deliberately. The product's whole argument is that
 * the archivist's minutes are the scarce resource — so the first thing on the
 * dashboard is where those minutes are owed, not a wall of numbers.
 */
export function QueueCallout() {
  const t = useTranslations("dashboard");
  const empty = REVIEW_QUEUE.waiting === 0;

  return (
    <section className="relative overflow-hidden rounded-[var(--radius-card)] bg-ink-panel p-5 text-ink-panel-fg sm:p-7">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <svg
          className="absolute -right-10 -top-16 h-72 w-[34rem] text-ink-panel-fg/[0.06]"
          viewBox="0 0 800 400"
          fill="none"
        >
          {Array.from({ length: 8 }, (_, i) => (
            <path
              key={i}
              d={`M-40 ${90 + i * 38} C 160 ${40 + i * 38}, 300 ${190 + i * 34}, 460 ${120 + i * 36} S 700 ${30 + i * 40}, 880 ${110 + i * 37}`}
              stroke="currentColor"
              strokeWidth="1.2"
            />
          ))}
        </svg>
        <div className="texture-grain absolute inset-0 opacity-25" />
      </div>

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
        <div className="flex min-w-0 flex-col gap-3">
          <h2 className="max-w-[22ch] font-display text-[clamp(1.25rem,1.05rem+0.9vw,1.75rem)] font-semibold leading-tight tracking-[-0.025em] [hyphens:none]">
            {t("queueTitle", { count: REVIEW_QUEUE.waiting })}
          </h2>

          {empty ? (
            <p className="text-[0.875rem] text-ink-panel-body">{t("queueEmpty")}</p>
          ) : (
            <dl className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex items-center gap-1.5">
                <Clock aria-hidden className="size-3.5 shrink-0 text-ink-panel-muted" strokeWidth={1.9} />
                <dt className="sr-only">{t("queueMetaAvg", { seconds: REVIEW_QUEUE.avgSecondsPerItem })}</dt>
                <dd className="font-mono text-[0.75rem] text-ink-panel-body">
                  {t("queueMetaAvg", { seconds: REVIEW_QUEUE.avgSecondsPerItem })}
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <span aria-hidden className="size-1 rounded-full bg-ink-panel-muted" />
                <dd className="font-mono text-[0.75rem] text-ink-panel-body">
                  {t("queueMetaOldest", { days: REVIEW_QUEUE.oldestDays })}
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <Gauge aria-hidden className="size-3.5 shrink-0 text-ink-panel-muted" strokeWidth={1.9} />
                <dd className="font-mono text-[0.75rem] text-ink-panel-muted">
                  {t("queueThreshold", { value: REVIEW_QUEUE.autoAcceptThreshold.toFixed(2) })}
                </dd>
              </div>
            </dl>
          )}
        </div>

        <Link
          href="/queue"
          className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-ink-panel-fg px-5 text-[0.9375rem] font-medium text-ink-panel transition-[background-color,transform] duration-200 hover:bg-white active:translate-y-px"
        >
          {t("queueCta")}
          <ArrowRight
            aria-hidden
            className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
            strokeWidth={2}
          />
        </Link>
      </div>
    </section>
  );
}
