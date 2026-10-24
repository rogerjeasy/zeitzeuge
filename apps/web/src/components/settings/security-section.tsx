"use client";

import { useTranslations } from "next-intl";
import { MonitorSmartphone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { SettingCard, SettingRow } from "./setting-primitives";

export function SecuritySection() {
  const t = useTranslations("settings.security");
  const tApp = useTranslations("app");

  return (
    <>
      <SettingCard title={t("title")} description={t("desc")}>
        <SettingRow
          label={t("passwordLabel")}
          hint={t("passwordHint")}
          control={
            <Link
              href="/auth/forgot-password"
              className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface px-3.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence"
            >
              {t("passwordCta")}
            </Link>
          }
        />

        {/* Rendered, disabled, and labelled — same rule as the SAML button. */}
        <SettingRow
          label={t("twoFactorLabel")}
          hint={t("twoFactorHint")}
          control={
            <span className="inline-flex h-9 items-center rounded-lg border border-dashed border-line-strong bg-surface-2/50 px-3 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted-2">
              {t("twoFactorPending")}
            </span>
          }
        />
      </SettingCard>

      <SettingCard title={t("sessionsLabel")} description={t("sessionsHint")}>
        <EmptyState
          size="inline"
          icon={MonitorSmartphone}
          tag={tApp("unavailable")}
          title={t("sessionsEmpty.title")}
          body={t("sessionsEmpty.body")}
        />
      </SettingCard>
    </>
  );
}
