"use client";

import { useTranslations } from "next-intl";
import { API_ERRORS, API_GROUPS, ENDPOINTS, METHOD_TONE } from "@/lib/data/reference";
import { CodeBlock, ResourceLayout, ResourceSection } from "./resource-shell";
import { cn } from "@/lib/cn";

const TOC = ["overview", "auth", "endpoints", "example", "errors", "limits"] as const;
const LIMIT_TOPICS = ["rate", "idempotency", "versioning"] as const;

const REQUEST = `POST /api/v1/runs
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: 6f3a1c2e-…

{
  "asset_id": "ast_01JBQ7X4",
  "mode": "standard"
}`;

const RESPONSE = `{
  "record_id": "rec_01JBQ7X4",
  "version": 1,
  "fields": [
    {
      "name": "place",
      "isad": "3.1.1",
      "value": "Brunnen, Gemeinde Ingenbohl SZ",
      "decision": "emit",
      "confidence": 0.94,
      "provenance": {
        "agent": "geo",
        "model": "claude-sonnet-5",
        "evidence": ["ev_001", "ev_007", "ev_012"],
        "decided_at": "2026-09-22T14:15:41Z"
      }
    },
    {
      "name": "photographer",
      "isad": "3.2.1",
      "decision": "abstain",
      "reason": "no_studio_stamp_no_verso_no_memory_match",
      "provenance": {
        "agent": "adjudicator",
        "model": "claude-opus-5",
        "evidence": [],
        "decided_at": "2026-09-22T14:16:03Z"
      }
    }
  ]
}`;

export function ApiContent() {
  const t = useTranslations("api");

  return (
    <ResourceLayout toc={TOC.map((id) => ({ id, label: t(`toc.${id}`) }))}>
      <ResourceSection id="overview" title={t("overview.title")} lede={t("overview.lede")}>
        <p className="max-w-[68ch] text-[0.9375rem] leading-[1.75] text-muted">
          {t("overview.body")}
        </p>
      </ResourceSection>

      <ResourceSection id="auth" title={t("auth.title")} lede={t("auth.lede")}>
        <p className="max-w-[68ch] text-[0.9375rem] leading-[1.75] text-muted">{t("auth.body")}</p>
      </ResourceSection>

      <ResourceSection id="endpoints" title={t("endpoints.title")} lede={t("endpoints.lede")}>
        <div className="flex flex-col gap-6">
          {API_GROUPS.map((group) => (
            <div key={group} className="flex flex-col gap-2">
              <h3 className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">
                {t(`endpoints.groups.${group}`)}
              </h3>
              <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
                {ENDPOINTS.filter((e) => e.group === group).map((endpoint) => (
                  <li key={endpoint.id} className="flex flex-col gap-2 p-3.5 sm:p-4">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                      <span
                        className={cn(
                          "shrink-0 rounded-[5px] px-1.5 py-0.5 font-mono text-[0.625rem] font-medium tracking-[0.04em]",
                          METHOD_TONE[endpoint.method],
                        )}
                      >
                        {endpoint.method}
                      </span>
                      <code className="min-w-0 break-all font-mono text-[0.8125rem] text-foreground-strong">
                        {endpoint.path}
                      </code>
                    </div>
                    <p className="text-[0.8125rem] leading-relaxed text-muted">
                      {t(`endpoints.${endpoint.id}`)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </ResourceSection>

      <ResourceSection id="example" title={t("example.title")} lede={t("example.lede")}>
        <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
          <CodeBlock label={t("example.requestLabel")}>{REQUEST}</CodeBlock>
          <CodeBlock label={t("example.responseLabel")}>{RESPONSE}</CodeBlock>
        </div>
        <p className="max-w-[68ch] rounded-lg border border-evidence/30 bg-evidence-soft/40 px-4 py-3 text-[0.875rem] leading-[1.7] text-muted">
          {t("example.note")}
        </p>
      </ResourceSection>

      <ResourceSection id="errors" title={t("errors.title")} lede={t("errors.lede")}>
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-line font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
                <th scope="col" className="px-4 py-2.5 font-normal">{t("errors.headerStatus")}</th>
                <th scope="col" className="px-4 py-2.5 font-normal">{t("errors.headerCode")}</th>
                <th scope="col" className="px-4 py-2.5 font-normal">{t("errors.headerMeaning")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {API_ERRORS.map((error) => (
                <tr key={error.code} className="align-baseline">
                  <td className="px-4 py-2.5 font-mono text-[0.8125rem] tabular-nums text-foreground-strong">
                    {error.status}
                  </td>
                  <th scope="row" className="px-4 py-2.5 text-left font-mono text-[0.75rem] font-normal text-evidence">
                    {error.code}
                  </th>
                  <td className="px-4 py-2.5 text-[0.8125rem] leading-relaxed text-muted">
                    {t(`errors.codes.${error.code}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ResourceSection>

      <ResourceSection id="limits" title={t("limits.title")}>
        <dl className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-3">
          {LIMIT_TOPICS.map((id) => (
            <div key={id} className="flex flex-col gap-1.5 bg-background p-4 sm:p-5">
              <dt className="text-[0.875rem] font-medium text-foreground-strong">
                {t(`limits.${id}.title`)}
              </dt>
              <dd className="text-[0.8125rem] leading-[1.7] text-muted">{t(`limits.${id}.body`)}</dd>
            </div>
          ))}
        </dl>
      </ResourceSection>
    </ResourceLayout>
  );
}
