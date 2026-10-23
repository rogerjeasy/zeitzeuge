"use client";

import { useTranslations } from "next-intl";
import { CircleDashed, CircleDot, CircleCheck, Info } from "lucide-react";
import { COMPONENTS, type ComponentState } from "@/lib/data/legal";
import { cn } from "@/lib/cn";

const STATE: Record<ComponentState, { icon: typeof CircleCheck; chip: string }> = {
  built: { icon: CircleCheck, chip: "bg-corroborated-soft text-corroborated" },
  partial: { icon: CircleDot, chip: "bg-review-soft text-review" },
  designed: { icon: CircleDashed, chip: "bg-abstain-soft text-abstain" },
};

/** Component readiness, in place of an availability figure nobody measured. */
export function StatusContent() {
  const t = useTranslations("status");

  return (
    <div className="mx-auto flex w-full max-w-[84rem] flex-col gap-6 px-5 py-12 sm:px-8 sm:py-16 lg:px-12">
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {COMPONENTS.map((component) => {
          const { icon: Icon, chip } = STATE[component.state];
          return (
            <li
              key={component.id}
              className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5"
            >
              <span className="min-w-0 text-[0.875rem] leading-snug text-foreground">
                {t(`components.${component.id}`)}
              </span>
              <span
                className={cn(
                  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.08em]",
                  chip,
                )}
              >
                <Icon aria-hidden className="size-3" strokeWidth={2.4} />
                {t(`states.${component.state}`)}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="flex max-w-[72ch] items-start gap-2.5 rounded-[var(--radius-card)] border border-line bg-surface-2/50 px-4 py-3.5 text-[0.875rem] leading-[1.7] text-muted">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-2" strokeWidth={2} />
        {t("note")}
      </p>
    </div>
  );
}
