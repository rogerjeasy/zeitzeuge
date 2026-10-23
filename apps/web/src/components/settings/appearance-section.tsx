"use client";

import { useTranslations } from "next-intl";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Toggle } from "@/components/ui/toggle";
import { useSettingsForm } from "@/hooks/use-settings-form";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { SettingCard, SettingRow } from "./setting-primitives";
import { SaveBar } from "./save-bar";
import { cn } from "@/lib/cn";

export function AppearanceSection() {
  const t = useTranslations("settings.appearance");
  const systemReduced = useReducedMotion();
  const form = useSettingsForm({ density: "comfortable", reduceMotion: false });

  return (
    <>
      <SettingCard title={t("title")} description={t("desc")}>
        {/* Theme and language apply immediately and are stored per device, so
            they are deliberately outside the save bar's dirty tracking. */}
        <SettingRow
          label={t("themeLabel")}
          hint={t("themeHint")}
          control={<ThemeToggle />}
        />

        <SettingRow
          label={t("langLabel")}
          hint={t("langHint")}
          control={<LocaleSwitcher />}
        />

        <SettingRow label={t("densityLabel")} hint={t("densityHint")} stack>
          <div className="flex gap-2">
            {(["comfortable", "compact"] as const).map((option) => {
              const active = form.values.density === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => form.set("density", option)}
                  aria-pressed={active}
                  className={cn(
                    "h-9 rounded-lg border px-3.5 text-[0.8125rem] transition-colors duration-150",
                    active
                      ? "border-evidence bg-evidence-soft text-evidence"
                      : "border-line-strong bg-surface text-muted hover:text-foreground",
                  )}
                >
                  {t(option === "comfortable" ? "densityComfortable" : "densityCompact")}
                </button>
              );
            })}
          </div>
        </SettingRow>

        <SettingRow
          label={t("motionLabel")}
          hint={t("motionHint")}
          control={
            <Toggle
              label={t("motionLabel")}
              checked={form.values.reduceMotion || systemReduced}
              disabled={systemReduced}
              onChange={(next) => form.set("reduceMotion", next)}
            />
          }
        />
      </SettingCard>

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
