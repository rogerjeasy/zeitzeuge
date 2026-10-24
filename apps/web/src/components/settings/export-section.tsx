"use client";

import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { EXPORT_FORMATS } from "@/lib/data/settings";
import { useSettingsForm } from "@/hooks/use-settings-form";
import { SettingCard, SettingRow } from "./setting-primitives";
import { SaveBar } from "./save-bar";

export function ExportSection() {
  const t = useTranslations("settings.export");
  const form = useSettingsForm({ format: "isad", provenance: true });
  return (
    <>
      <SettingCard title={t("title")} description={t("desc")}>
        <SettingRow label={t("formatLabel")} hint={t("formatHint")} stack>
          <Select
            label={t("formatLabel")}
            hideLabel
            className="sm:max-w-[20rem]"
            value={form.values.format}
            onChange={(e) => form.set("format", e.target.value)}
            options={EXPORT_FORMATS.map((f) => ({ value: f.id, label: f.label }))}
          />
        </SettingRow>

        {/* Dropping the provenance block is how a machine claim later becomes
            indistinguishable from a human one — §17 calls that out explicitly. */}
        <SettingRow
          label={t("provenanceLabel")}
          hint={t("provenanceHint")}
          control={
            <Toggle
              label={t("provenanceLabel")}
              checked={form.values.provenance}
              onChange={(next) => form.set("provenance", next)}
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
