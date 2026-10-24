"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LogOut, Users } from "lucide-react";
import { useSessionUser } from "@/components/auth/session-provider";
import { EmptyState } from "@/components/ui/empty-state";
import { SettingCard, SettingFact } from "./setting-primitives";

export function ArchiveSection() {
  const t = useTranslations("settings.archive");
  const tApp = useTranslations("app");
  const user = useSessionUser();

  return (
    <>
      <SettingCard title={t("title")} description={t("desc")}>
        <SettingFact label={t("nameLabel")} value={user.organizationName} locked={false} />
      </SettingCard>

      {/* Not settings. Stated here because this is where they get asked about. */}
      <SettingCard title={t("governanceTitle")} description={t("governanceNote")}>
        <SettingFact label={t("residencyLabel")} value={t("residencyValue")} />
        <SettingFact label={t("rlsLabel")} value={t("rlsValue")} />
        <SettingFact label={t("appendOnlyLabel")} value={t("appendOnlyValue")} />
      </SettingCard>

      <SettingCard title={t("membersLabel")} description={t("membersHint")}>
        <EmptyState
          size="inline"
          icon={Users}
          tag={tApp("unavailable")}
          title={t("membersEmpty.title")}
          body={t("membersEmpty.body")}
        />
      </SettingCard>

      {!user.isGuest && <LeaveArchive />}
    </>
  );
}

function LeaveArchive() {
  const t = useTranslations("settings.archive");
  const tAccount = useTranslations("settings.account");
  const [confirming, setConfirming] = useState(false);

  return (
    <SettingCard title={t("leaveTitle")} description={t("leaveDesc")} tone="danger">
      <div className="flex flex-wrap gap-2 px-4 py-4 sm:px-5">
        {confirming ? (
          <>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-refuted px-4 text-[0.8125rem] font-medium text-background"
            >
              <LogOut aria-hidden className="size-3.5" strokeWidth={2} />
              {t("leaveCta")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-10 rounded-lg px-4 text-[0.8125rem] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              {tAccount("cancel")}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-refuted/40 bg-refuted-soft px-4 text-[0.8125rem] font-medium text-refuted transition-colors hover:border-refuted"
          >
            <LogOut aria-hidden className="size-3.5" strokeWidth={2} />
            {t("leaveCta")}
          </button>
        )}
      </div>
    </SettingCard>
  );
}
