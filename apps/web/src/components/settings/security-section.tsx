"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Monitor, Smartphone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SESSIONS } from "@/lib/data/settings";
import { SettingCard, SettingRow } from "./setting-primitives";
import { cn } from "@/lib/cn";

export function SecuritySection() {
  const t = useTranslations("settings.security");
  const [revoked, setRevoked] = useState<string[]>([]);
  const others = SESSIONS.filter((s) => !s.current);
  const allRevoked = others.every((s) => revoked.includes(s.id));

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
        <ul className="flex flex-col divide-y divide-line">
          {SESSIONS.map((session) => {
            const isRevoked = revoked.includes(session.id);
            const Icon = session.device.includes("iPhone") ? Smartphone : Monitor;

            return (
              <li
                key={session.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3.5 sm:px-5",
                  isRevoked && "opacity-50",
                )}
              >
                <Icon aria-hidden className="size-4 shrink-0 text-muted-2" strokeWidth={1.9} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-foreground">
                    {session.device}
                    {session.current && (
                      <span className="rounded-full bg-corroborated-soft px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-corroborated">
                        {t("sessionCurrent")}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[0.625rem] text-muted-2">
                    {session.location} · {t("lastActive")} {session.lastActive}
                  </span>
                </div>
                {!session.current && (
                  <button
                    type="button"
                    disabled={isRevoked}
                    onClick={() => setRevoked((r) => [...r, session.id])}
                    className="shrink-0 rounded-lg px-2.5 py-1.5 text-[0.75rem] text-refuted transition-colors hover:bg-refuted-soft disabled:pointer-events-none"
                  >
                    {t("revoke")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="px-4 py-3.5 sm:px-5">
          <button
            type="button"
            disabled={allRevoked}
            onClick={() => setRevoked(others.map((s) => s.id))}
            className="inline-flex h-9 items-center rounded-lg border border-refuted/40 bg-refuted-soft px-3.5 text-[0.8125rem] font-medium text-refuted transition-colors hover:border-refuted disabled:opacity-40"
          >
            {t("revokeAll")}
          </button>
        </div>
      </SettingCard>
    </>
  );
}
