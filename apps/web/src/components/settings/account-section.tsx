"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Field } from "@/components/ui/field";
import { useSessionUser } from "@/components/auth/session-provider";
import { SettingCard, SettingFact, SettingRow } from "./setting-primitives";

export function AccountSection() {
  const t = useTranslations("settings.account");
  const tRoles = useTranslations("settings.archive.roles");
  const user = useSessionUser();
  const role = tRoles.has(user.role) ? tRoles(user.role) : user.role;

  return (
    <>
      {/* What the API holds for this account. Editing it here comes later. */}
      <SettingCard title={t("title")} description={t("desc")}>
        <SettingFact label={t("nameLabel")} value={user.displayName} locked={false} />
        <SettingFact label={t("emailLabel")} value={user.email} locked={false} />
        <SettingRow
          label={t("roleLabel")}
          hint={t("roleHint")}
          control={
            <span className="rounded-full bg-evidence-soft px-2.5 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-evidence">
              {role}
            </span>
          }
        />
      </SettingCard>

      <SettingCard title={t("profileTitle")} description={t("profileDesc")}>
        <div className="px-4 py-4 sm:px-5">
          <Link
            href="/profile"
            className="group inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-[0.8125rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence"
          >
            {t("profileCta")}
            <ArrowRight
              aria-hidden
              className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
              strokeWidth={2}
            />
          </Link>
        </div>
      </SettingCard>

      {!user.isGuest && <DangerZone />}
    </>
  );
}

/**
 * Destructive, so it demands the word typed out. The copy states plainly that
 * accepted catalogue records survive — the catalogue is append-only, and a
 * deletion dialogue is exactly where that promise has to be legible.
 */
function DangerZone() {
  const t = useTranslations("settings.account");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const word = "LÖSCHEN";

  return (
    <SettingCard title={t("dangerTitle")} description={t("dangerDesc")} tone="danger">
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-lg border border-refuted/40 bg-refuted-soft px-4 text-[0.8125rem] font-medium text-refuted transition-colors hover:border-refuted"
          >
            <Trash2 aria-hidden className="size-3.5" strokeWidth={2} />
            {t("dangerCta")}
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <Field
              label={t("dangerConfirm", { word })}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={typed !== word}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-refuted px-4 text-[0.8125rem] font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 aria-hidden className="size-3.5" strokeWidth={2} />
                {t("dangerCta")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setTyped("");
                }}
                className="h-10 rounded-lg px-4 text-[0.8125rem] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </SettingCard>
  );
}
