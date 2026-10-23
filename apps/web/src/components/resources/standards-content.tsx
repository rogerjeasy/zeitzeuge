"use client";

import { useTranslations } from "next-intl";
import { Check, Minus } from "lucide-react";
import {
  EXPORT_STANDARDS,
  ISAD_ELEMENTS,
  PROVENANCE_FIELDS,
  type StandardStatus,
} from "@/lib/data/reference";
import { ResourceLayout, ResourceSection } from "./resource-shell";
import { cn } from "@/lib/cn";

const TOC = ["isad", "exports", "provenance", "harvest", "writeback"] as const;

const STATUS_TONE: Record<StandardStatus, string> = {
  ships: "bg-corroborated-soft text-corroborated",
  planned: "bg-review-soft text-review",
  designed: "bg-abstain-soft text-abstain",
};

export function StandardsContent() {
  const t = useTranslations("standards");
  const tFields = useTranslations("ledger.fields");

  return (
    <ResourceLayout toc={TOC.map((id) => ({ id, label: t(`toc.${id}`) }))}>
      <ResourceSection id="isad" title={t("isad.title")} lede={t("isad.lede")}>
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
          <table className="w-full min-w-[38rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-line font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
                <th scope="col" className="px-4 py-2.5 font-normal">{t("isad.headerElement")}</th>
                <th scope="col" className="px-4 py-2.5 font-normal">{t("isad.headerName")}</th>
                <th scope="col" className="px-4 py-2.5 font-normal">{t("isad.headerField")}</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">{t("isad.headerEmitted")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ISAD_ELEMENTS.map((element) => (
                <tr
                  key={element.tag}
                  className={cn("align-baseline", !element.emitted && "opacity-60")}
                >
                  <th scope="row" className="px-4 py-2.5 text-left font-mono text-[0.75rem] font-normal tabular-nums text-foreground-strong">
                    {element.tag}
                  </th>
                  <td className="px-4 py-2.5 text-[0.8125rem] text-foreground">
                    {t(`isadNames.${element.id}`)}
                  </td>
                  <td className="px-4 py-2.5 text-[0.8125rem] text-muted">
                    {element.fieldKey ? (
                      tFields(element.fieldKey)
                    ) : (
                      <span className="font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-muted-2">
                        {element.emitted ? t("isad.derived") : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.06em]",
                        element.emitted
                          ? "bg-corroborated-soft text-corroborated"
                          : "bg-abstain-soft text-abstain",
                      )}
                    >
                      {element.emitted ? (
                        <Check aria-hidden className="size-2.5" strokeWidth={3.5} />
                      ) : (
                        <Minus aria-hidden className="size-2.5" strokeWidth={3} />
                      )}
                      {element.emitted ? t("isad.emitted") : t("isad.notEmitted")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="max-w-[68ch] text-[0.875rem] leading-[1.7] text-muted">{t("isad.note")}</p>
      </ResourceSection>

      <ResourceSection id="exports" title={t("exports.title")} lede={t("exports.lede")}>
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-line font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
                <th scope="col" className="px-4 py-2.5 font-normal">{t("exports.headerFormat")}</th>
                <th scope="col" className="px-4 py-2.5 font-normal">{t("exports.headerStandard")}</th>
                <th scope="col" className="px-4 py-2.5 font-normal">{t("exports.headerType")}</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">{t("exports.headerStatus")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {EXPORT_STANDARDS.map((format) => (
                <tr key={format.id} className="align-baseline">
                  <th scope="row" className="px-4 py-2.5 text-left text-[0.8125rem] font-normal text-foreground-strong">
                    {t(`formats.${format.id}`)}
                  </th>
                  <td className="px-4 py-2.5 text-[0.8125rem] text-muted">{format.standard}</td>
                  <td className="px-4 py-2.5 font-mono text-[0.6875rem] text-muted-2">
                    {format.mediaType}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={cn(
                        "inline-block rounded-full px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.06em]",
                        STATUS_TONE[format.status],
                      )}
                    >
                      {t(`exports.status.${format.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ResourceSection>

      <ResourceSection id="provenance" title={t("provenance.title")} lede={t("provenance.lede")}>
        <dl className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2">
          {PROVENANCE_FIELDS.map((field) => (
            <div key={field} className="flex flex-col gap-1 bg-background p-4">
              <dt className="font-mono text-[0.75rem] text-evidence">{field}</dt>
              <dd className="text-[0.8125rem] leading-relaxed text-muted">
                {t(`provenance.fields.${field}`)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="max-w-[68ch] text-[0.9375rem] leading-[1.75] text-muted">
          {t("provenance.note")}
        </p>
      </ResourceSection>

      <ResourceSection id="harvest" title={t("harvest.title")} lede={t("harvest.lede")}>
        <p className="max-w-[68ch] text-[0.9375rem] leading-[1.75] text-muted">{t("harvest.body")}</p>
      </ResourceSection>

      <ResourceSection id="writeback" title={t("writeback.title")} lede={t("writeback.lede")}>
        <p className="max-w-[68ch] rounded-[var(--radius-card)] border border-abstain/30 bg-abstain-soft/40 px-4 py-4 text-[0.9375rem] leading-[1.75] text-muted sm:px-5">
          {t("writeback.body")}
        </p>
      </ResourceSection>
    </ResourceLayout>
  );
}
