"use client";

import { useLocale, useTranslations } from "next-intl";
import { Slider } from "@/components/ui/slider";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { CATALOGUING_DEFAULTS, COLLECTIONS, RUN_MODES } from "@/lib/data/settings";
import { useSettingsForm } from "@/hooks/use-settings-form";
import { SettingCard, SettingRow, InlineWarning } from "./setting-primitives";
import { SaveBar } from "./save-bar";
import { cn } from "@/lib/cn";

export function CataloguingSection() {
  const t = useTranslations("settings.cataloguing");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;

  const form = useSettingsForm({
    threshold: CATALOGUING_DEFAULTS.autoAcceptThreshold,
    mode: CATALOGUING_DEFAULTS.mode as string,
    abstention: CATALOGUING_DEFAULTS.allowAbstention,
    collection: CATALOGUING_DEFAULTS.defaultCollection,
  });

  const usd = (v: number) =>
    new Intl.NumberFormat(intl, { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);

  return (
    <>
      <SettingCard title={t("title")} description={t("desc")}>
        {/* §9.2 #7 — the archivist sets bulk-accept themselves. */}
        <SettingRow label={t("thresholdLabel")} hint={t("thresholdHint")} stack>
          <Slider
            label={t("thresholdLabel")}
            hideLabel
            value={form.values.threshold}
            min={0.5}
            max={1}
            step={0.01}
            onChange={(next) => form.set("threshold", next)}
            valueLabel={form.values.threshold.toFixed(2)}
            marks={[
              { value: 0.5, label: "0.50" },
              { value: 1, label: "1.00" },
            ]}
          />
        </SettingRow>

        <SettingRow label={t("modeLabel")} hint={t("modeHint")} stack>
          <div role="radiogroup" aria-label={t("modeLabel")} className="grid gap-2 sm:grid-cols-3">
            {RUN_MODES.map((mode) => {
              const active = form.values.mode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => form.set("mode", mode.id)}
                  className={cn(
                    "flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors duration-150",
                    active
                      ? "border-evidence bg-evidence-soft"
                      : "border-line-strong bg-surface hover:border-muted-2",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-3.5 shrink-0 place-items-center rounded-full border",
                        active ? "border-evidence" : "border-line-strong",
                      )}
                    >
                      {active && <span className="size-1.5 rounded-full bg-evidence" />}
                    </span>
                    <span className={cn("text-[0.8125rem] font-medium", active ? "text-evidence" : "text-foreground")}>
                      {t(`modes.${mode.id}`)}
                    </span>
                  </span>
                  <span className="text-[0.6875rem] leading-snug text-muted">
                    {t(`modes.${mode.id}Desc`)}
                  </span>
                  {/* `muted-2` is too quiet once this card is tinted (4.18:1) — use `muted`. */}
                  <span className="mt-auto pt-1 font-mono text-[0.625rem] tabular-nums text-muted">
                    {usd(mode.costUsd)} {t("perImage")}
                  </span>
                </button>
              );
            })}
          </div>
        </SettingRow>

        {/* P3 — abstention is the product's position, so switching it off warns. */}
        <SettingRow
          label={t("abstentionLabel")}
          hint={t("abstentionHint")}
          control={
            <Toggle
              label={t("abstentionLabel")}
              checked={form.values.abstention}
              onChange={(next) => form.set("abstention", next)}
            />
          }
        >
          {!form.values.abstention && (
            <InlineWarning>{t("abstentionWarning")}</InlineWarning>
          )}
        </SettingRow>

        <SettingRow label={t("collectionLabel")} hint={t("collectionHint")} stack>
          <Select
            label={t("collectionLabel")}
            hideLabel
            className="sm:max-w-[20rem]"
            value={form.values.collection}
            onChange={(e) => form.set("collection", e.target.value)}
            options={COLLECTIONS.map((c) => ({ value: c.id, label: c.name }))}
          />
        </SettingRow>
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
