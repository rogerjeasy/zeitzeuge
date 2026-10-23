"use client";

import { useLocale, useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { Select } from "@/components/ui/select";
import { SaveBar } from "@/components/settings/save-bar";
import {
  InlineWarning,
  SettingCard,
  SettingRow,
} from "@/components/settings/setting-primitives";
import { useSettingsForm } from "@/hooks/use-settings-form";
import {
  ADMIN_DEFAULTS,
  BINDINGS,
  BUDGET,
  GUARDRAIL_ACTIONS,
  GUARDRAIL_POLICIES,
  type GuardrailAction,
} from "@/lib/data/admin";
import { Cascade } from "./cascade";
import { cn } from "@/lib/cn";

/**
 * Administration (§9.2 #11).
 *
 * Four settings, each shown with the number it moves. The two that can weaken
 * the product's own guarantees — abstention and the fail-closed gate — say so
 * in place rather than in documentation, and the two policies that are not ours
 * to relax are not editable at all. A console that lets an operator quietly
 * turn off the thing the pitch promised is worse than no console.
 */
export function AdminScreen() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;

  const form = useSettingsForm({
    ...ADMIN_DEFAULTS,
    policies: Object.fromEntries(
      GUARDRAIL_POLICIES.map((p) => [p.id, p.action]),
    ) as Record<string, GuardrailAction>,
  });
  const v = form.values;

  const money = (value: number, digits = 0) =>
    new Intl.NumberFormat(intl, {
      style: "currency", currency: "USD",
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(value);
  const pct = (value: number) =>
    new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 0 }).format(value);

  return (
    <div className="mx-auto flex w-full max-w-[64rem] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
          {t("title")}
        </h1>
        <p className="max-w-[78ch] text-[0.875rem] leading-relaxed text-muted">{t("subtitle")}</p>
      </header>

      {/* ── model routing ───────────────────────────────────────────────── */}
      <SettingCard title={t("routing.title")} description={t("routing.desc")}>
        <SettingRow label={t("routing.emitAtFast")} hint={t("routing.emitAtFastHint")}>
          <Slider
            label={t("routing.emitAtFast")}
            hideLabel
            min={0.5} max={0.99} step={0.01}
            value={v.emitAtFast}
            valueLabel={v.emitAtFast.toFixed(2)}
            onChange={(next) => form.set("emitAtFast", next)}
          />
        </SettingRow>

        <SettingRow label={t("routing.emitAtStandard")} hint={t("routing.emitAtStandardHint")}>
          <Slider
            label={t("routing.emitAtStandard")}
            hideLabel
            min={0.5} max={0.99} step={0.01}
            value={v.emitAtStandard}
            valueLabel={v.emitAtStandard.toFixed(2)}
            onChange={(next) => form.set("emitAtStandard", next)}
          />
          <div className="mt-3">
            <Cascade emitAtFast={v.emitAtFast} emitAtStandard={v.emitAtStandard} />
          </div>
        </SettingRow>

        <SettingRow label={t("routing.bindingsTitle")} hint={t("routing.bindingsHint")} stack>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-line font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
                  <th scope="col" className="py-1.5 pr-3 font-normal">{t("routing.headerStage")}</th>
                  <th scope="col" className="py-1.5 pr-3 font-normal">{t("routing.headerModel")}</th>
                  <th scope="col" className="py-1.5 pr-3 font-normal">{t("routing.headerRegion")}</th>
                  <th scope="col" className="py-1.5 font-normal">{t("routing.headerFallback")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {BINDINGS.map((b) => (
                  <tr key={b.id} className="align-baseline">
                    <th scope="row" className="py-2 pr-3 text-left text-[0.75rem] font-normal text-foreground">
                      {t(`routing.stages.${b.id}`)}
                    </th>
                    <td className="py-2 pr-3 font-mono text-[0.6875rem] text-foreground-strong">{b.model}</td>
                    <td className="py-2 pr-3 font-mono text-[0.6875rem] text-muted">{b.region}</td>
                    <td className="py-2 font-mono text-[0.6875rem] text-muted-2">{b.fallback}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SettingRow>
      </SettingCard>

      {/* ── decision thresholds ─────────────────────────────────────────── */}
      <SettingCard title={t("thresholds.title")} description={t("thresholds.desc")}>
        <SettingRow label={t("thresholds.autoAccept")} hint={t("thresholds.autoAcceptHint")}>
          <Slider
            label={t("thresholds.autoAccept")}
            hideLabel
            min={0.7} max={1} step={0.01}
            value={v.autoAccept}
            valueLabel={v.autoAccept.toFixed(2)}
            onChange={(next) => form.set("autoAccept", next)}
          />
        </SettingRow>

        <SettingRow
          label={t("thresholds.abstention")}
          hint={t("thresholds.abstentionHint")}
          control={
            <Toggle
              checked={v.allowAbstention}
              onChange={(next) => form.set("allowAbstention", next)}
              label={t("thresholds.abstention")}
            />
          }
        >
          {!v.allowAbstention && (
            <InlineWarning>{t("thresholds.abstentionWarning")}</InlineWarning>
          )}
        </SettingRow>
      </SettingCard>

      {/* ── guardrail policy ────────────────────────────────────────────── */}
      <SettingCard title={t("guardrails.title")} description={t("guardrails.desc")}>
        <SettingRow
          label={t("guardrails.failClosed")}
          hint={t("guardrails.failClosedHint")}
          control={
            <Toggle
              checked={v.failClosed}
              onChange={(next) => form.set("failClosed", next)}
              label={t("guardrails.failClosed")}
            />
          }
        >
          {!v.failClosed && <InlineWarning>{t("guardrails.failClosedWarning")}</InlineWarning>}
        </SettingRow>

        <div className="flex flex-col divide-y divide-line">
          {GUARDRAIL_POLICIES.map((policy) => (
            <div
              key={policy.id}
              className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-5"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2 text-[0.8125rem] font-medium text-foreground">
                  {t(`guardrails.policies.${policy.id}`)}
                  {policy.locked && (
                    <span
                      title={t("guardrails.lockedHint")}
                      className="inline-flex items-center gap-1 rounded-full bg-abstain-soft px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.06em] text-abstain"
                    >
                      <Lock aria-hidden className="size-2.5" strokeWidth={2.4} />
                      {t("guardrails.locked")}
                    </span>
                  )}
                </span>
                <span className="max-w-[62ch] text-[0.75rem] leading-relaxed text-muted">
                  {t(`guardrails.policies.${policy.id}Desc`)}
                </span>
              </div>

              {policy.locked ? (
                <span className="shrink-0 rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-[0.75rem] text-muted">
                  {t(`guardrails.actions.${policy.action}`)}
                </span>
              ) : (
                <Select
                  label={t("guardrails.headerAction")}
                  hideLabel
                  className="w-full shrink-0 sm:w-[14rem]"
                  value={v.policies[policy.id]}
                  onChange={(event) =>
                    form.set("policies", {
                      ...v.policies,
                      [policy.id]: event.target.value as GuardrailAction,
                    })
                  }
                  options={GUARDRAIL_ACTIONS.map((action) => ({
                    value: action,
                    label: t(`guardrails.actions.${action}`),
                  }))}
                />
              )}
            </div>
          ))}
        </div>
      </SettingCard>

      {/* ── cost caps ───────────────────────────────────────────────────── */}
      <SettingCard title={t("costs.title")} description={t("costs.desc")}>
        <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 font-mono text-[0.75rem] tabular-nums">
            <span className="text-muted">
              {t("costs.spent")} <span className="text-foreground-strong">{money(BUDGET.spentUsd)}</span>
            </span>
            <span className="text-muted-2">
              {t("costs.remaining")} {money(BUDGET.totalUsd - BUDGET.spentUsd)} / {money(BUDGET.totalUsd)}
            </span>
          </div>

          <span aria-hidden className="relative flex h-2.5 overflow-hidden rounded-full bg-line-strong/25">
            <span
              className="h-full rounded-full bg-evidence"
              style={{ width: `${(BUDGET.spentUsd / BUDGET.totalUsd) * 100}%` }}
            />
            {/* the three billing alarms, and the one that also pauses batches */}
            {BUDGET.alarms.map((alarm) => (
              <span
                key={alarm}
                title={pct(alarm)}
                className={cn(
                  "absolute top-0 h-full w-px",
                  alarm === v.alarmAt ? "bg-review" : "bg-foreground-strong/35",
                )}
                style={{ left: `${alarm * 100}%` }}
              />
            ))}
          </span>
        </div>

        <SettingRow label={t("costs.alarmAt")} hint={t("costs.alarmHint")}>
          <Slider
            label={t("costs.alarmAt")}
            hideLabel
            min={0.25} max={0.95} step={0.05}
            value={v.alarmAt}
            valueLabel={pct(v.alarmAt)}
            onChange={(next) => form.set("alarmAt", next)}
          />
        </SettingRow>

        <SettingRow label={t("costs.perRun")} hint={t("costs.perRunHint")}>
          <Slider
            label={t("costs.perRun")}
            hideLabel
            min={0.25} max={5} step={0.25}
            value={v.perRunCapUsd}
            valueLabel={money(v.perRunCapUsd, 2)}
            onChange={(next) => form.set("perRunCapUsd", next)}
          />
        </SettingRow>

        <SettingRow label={t("costs.daily")} hint={t("costs.dailyHint")}>
          <Slider
            label={t("costs.daily")}
            hideLabel
            min={20} max={400} step={10}
            value={v.dailyCapUsd}
            valueLabel={money(v.dailyCapUsd)}
            onChange={(next) => form.set("dailyCapUsd", next)}
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
    </div>
  );
}
