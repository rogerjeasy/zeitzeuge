"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { KeyRound, Plus } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { API_TOKENS, type ApiToken } from "@/lib/data/settings";
import { SettingCard, SettingRow, NotConnectedNotice } from "./setting-primitives";
import { cn } from "@/lib/cn";

/**
 * Designed, not connected.
 *
 * Nothing in the system issues tokens yet, so the notice at the top says so and
 * anything created here is visibly a placeholder. The alternative — a screen
 * that mints real-looking keys against no backend — would be a claim the
 * architecture cannot support.
 */
export function ApiSection() {
  const t = useTranslations("settings.api");
  const [tokens, setTokens] = useState<ApiToken[]>(API_TOKENS);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("read");

  function create() {
    if (!name.trim()) return;
    setTokens((list) => [
      {
        id: `t${Date.now()}`,
        name: name.trim(),
        prefix: "zz_demo_xxxx",
        scope,
        createdDaysAgo: 0,
        lastUsedDaysAgo: null,
      },
      ...list,
    ]);
    setName("");
  }

  return (
    <SettingCard title={t("title")} description={t("desc")}>
      <NotConnectedNotice>{t("notice")}</NotConnectedNotice>

      <SettingRow label={t("createLabel")} hint={t("createHint")} stack>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field
            label={t("nameLabel")}
            className="flex-1"
            placeholder={t("namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select
            label={t("scopeLabel")}
            className="sm:w-[12rem]"
            value={scope}
            onChange={(e) => setScope(e.target.value as "read" | "write")}
            options={[
              { value: "read", label: t("scopeRead") },
              { value: "write", label: t("scopeWrite") },
            ]}
          />
          <button
            type="button"
            onClick={create}
            disabled={!name.trim()}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-[0.8125rem] font-medium text-background transition-colors hover:bg-foreground-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus aria-hidden className="size-3.5" strokeWidth={2.4} />
            {t("createCta")}
          </button>
        </div>
      </SettingRow>

      <div className="flex flex-col">
        <p className="px-4 pb-1 pt-3.5 font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2 sm:px-5">
          {t("listLabel")}
        </p>

        {tokens.length === 0 ? (
          <p className="px-4 py-6 text-center text-[0.8125rem] text-muted sm:px-5">
            {t("empty")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line border-t border-line">
            {tokens.map((token) => (
              <li key={token.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted-2">
                  <KeyRound aria-hidden className="size-3.5" strokeWidth={1.9} />
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[0.8125rem] font-medium text-foreground">
                      {token.name}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.08em]",
                        token.scope === "write"
                          ? "bg-review-soft text-review"
                          : "bg-surface-2 text-muted",
                      )}
                    >
                      {t(token.scope === "write" ? "scopeWrite" : "scopeRead")}
                    </span>
                  </span>
                  <span className="font-mono text-[0.625rem] text-muted-2">
                    {token.prefix}··· ·{" "}
                    {token.createdDaysAgo === 0 ? t("today") : t("created", { days: token.createdDaysAgo })}
                    {" · "}
                    {token.lastUsedDaysAgo === null
                      ? t("never")
                      : token.lastUsedDaysAgo === 0
                        ? t("today")
                        : t("lastUsed", { days: token.lastUsedDaysAgo })}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setTokens((list) => list.filter((x) => x.id !== token.id))}
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-[0.75rem] text-refuted transition-colors hover:bg-refuted-soft"
                >
                  {t("revoke")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SettingCard>
  );
}
