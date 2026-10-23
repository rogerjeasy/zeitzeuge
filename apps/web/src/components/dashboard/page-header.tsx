"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { CURRENT_USER } from "@/lib/data/dashboard";

/**
 * Time-of-day greeting. The reader's local hour is not knowable on the server,
 * so it is read as an external snapshot: React renders the neutral form during
 * SSR and swaps to the real one on hydration, with no mismatch and no effect
 * writing into state afterwards.
 */
function partOfDay() {
  const hour = new Date().getHours();
  return hour < 11 ? "Morning" : hour >= 18 ? "Evening" : "Day";
}

/** Nothing to subscribe to — the value only needs to be right at render. */
const subscribe = () => () => {};

export function PageHeader() {
  const t = useTranslations("dashboard");
  const part = useSyncExternalStore(subscribe, partOfDay, () => "Day" as const);
  const firstName = CURRENT_USER.name.split(" ")[0];

  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
        {t(`greeting${part}`)}, {firstName}.
      </h1>
      <p className="text-[0.875rem] text-muted">{t("subtitle")}</p>
    </div>
  );
}
