"use client";

import { useTranslations } from "next-intl";
import { KeyRound } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SettingCard } from "./setting-primitives";

/**
 * Nothing in the system issues API keys yet, so this card says so instead of
 * listing example keys.
 */
export function ApiSection() {
  const t = useTranslations("settings.api");
  const tApp = useTranslations("app");
  return (
    <SettingCard title={t("title")} description={t("desc")}>
      <EmptyState
        size="inline"
        icon={KeyRound}
        tag={tApp("unavailable")}
        title={t("empty.title")}
        body={t("empty.body")}
      />
    </SettingCard>
  );
}
