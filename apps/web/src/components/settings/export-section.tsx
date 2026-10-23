"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { EXPORT_FORMATS, OAI_ENDPOINT } from "@/lib/data/settings";
import { useSettingsForm } from "@/hooks/use-settings-form";
import { SettingCard, SettingRow } from "./setting-primitives";
import { SaveBar } from "./save-bar";

export function ExportSection() {
  const t = useTranslations("settings.export");
  const form = useSettingsForm({ format: "isad", provenance: true });
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(OAI_ENDPOINT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the endpoint is selectable in the field */
    }
  }

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

        <SettingRow label={t("oaiLabel")} hint={t("oaiHint")} stack>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={OAI_ENDPOINT}
              aria-label={t("oaiLabel")}
              onFocus={(e) => e.currentTarget.select()}
              className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface-2/60 px-3 font-mono text-[0.75rem] text-muted focus:outline-none focus-visible:border-evidence focus-visible:ring-2 focus-visible:ring-evidence/25"
            />
            <button
              type="button"
              onClick={copy}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence"
            >
              {copied ? (
                <Check aria-hidden className="size-3.5 text-corroborated" strokeWidth={2.5} />
              ) : (
                <Copy aria-hidden className="size-3.5" strokeWidth={2} />
              )}
              {copied ? t("copied") : t("copy")}
            </button>
          </div>
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
