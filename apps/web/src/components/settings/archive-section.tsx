"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LogOut, UserPlus } from "lucide-react";
import { Field } from "@/components/ui/field";
import { ARCHIVES } from "@/lib/data/dashboard";
import { MEMBERS } from "@/lib/data/settings";
import { useSettingsForm } from "@/hooks/use-settings-form";
import { SettingCard, SettingRow, SettingFact } from "./setting-primitives";
import { SaveBar } from "./save-bar";

export function ArchiveSection() {
  const t = useTranslations("settings.archive");
  const form = useSettingsForm({ name: ARCHIVES[0].name });

  return (
    <>
      <SettingCard title={t("title")} description={t("desc")}>
        <SettingRow label={t("nameLabel")} stack>
          <Field
            label={t("nameLabel")}
            hideLabel
            className="sm:max-w-[24rem]"
            value={form.values.name}
            onChange={(e) => form.set("name", e.target.value)}
          />
        </SettingRow>
      </SettingCard>

      {/* Not settings. Stated here because this is where they get asked about. */}
      <SettingCard title={t("governanceTitle")} description={t("governanceNote")}>
        <SettingFact label={t("residencyLabel")} value={t("residencyValue")} />
        <SettingFact label={t("rlsLabel")} value={t("rlsValue")} />
        <SettingFact label={t("appendOnlyLabel")} value={t("appendOnlyValue")} />
      </SettingCard>

      <SettingCard title={t("membersLabel")} description={t("membersHint")}>
        <ul className="flex flex-col divide-y divide-line">
          {MEMBERS.map((member) => (
            <li key={member.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-full bg-evidence-soft font-mono text-[0.625rem] font-semibold text-evidence"
              >
                {member.initials}
              </span>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[0.8125rem] font-medium text-foreground">
                  {member.name}
                </span>
                <span className="truncate font-mono text-[0.625rem] text-muted-2">
                  {member.email}
                </span>
              </div>
              <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-muted">
                {t(`roles.${member.role}`)}
              </span>
            </li>
          ))}
        </ul>

        <div className="px-4 py-3.5 sm:px-5">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence"
          >
            <UserPlus aria-hidden className="size-3.5" strokeWidth={2} />
            {t("invite")}
          </button>
        </div>
      </SettingCard>

      <LeaveArchive />

      <SaveBar
        dirty={form.dirty}
        saving={form.saving}
        saved={form.saved}
        onSave={form.save}
        onDiscard={form.discard}
      />
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
