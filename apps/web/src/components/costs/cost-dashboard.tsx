"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Info, Table2, BarChart3 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { CostReport, CostVendor } from "@/lib/api/investigation-types";
import { cn } from "@/lib/cn";
import { ARCHIVE_TZ, intlLocale } from "@/components/investigation/labels";

/**
 * The cost page: what the investigation costs, from the recorded model calls.
 *
 * Colour follows the vendor, never the rank (dataviz method): Anthropic, OpenAI
 * and Google take the first three categorical slots, validated in both modes
 * against this app's surfaces (#ffffff, #0c1522). Google's aqua is below 3:1 on
 * white, so every chart has a legend naming each vendor and a table view.
 */
const VENDORS: CostVendor[] = ["anthropic", "openai", "google", "mixed", "other"];
const STYLE = `
.cost-viz {
  --v-anthropic: #2a78d6; --v-openai: #eb6834; --v-google: #1baf7a;
  --v-mixed: #a3a29b; --v-other: #c3c2b7;
  --grid: color-mix(in oklab, currentColor 12%, transparent);
}
.dark .cost-viz {
  --v-anthropic: #3987e5; --v-openai: #d95926; --v-google: #199e70;
  --v-mixed: #6c6b66; --v-other: #55544f;
}
`;

const PERIODS: { days: number | null; key: string }[] = [
  { days: 7, key: "d7" },
  { days: 30, key: "d30" },
  { days: 90, key: "d90" },
  { days: null, key: "all" },
];

export function CostDashboard({ report }: { report: CostReport }) {
  const t = useTranslations("costs");
  const intl = intlLocale(useLocale());
  const usd = useMemo(
    () => (v: number, digits = 2) =>
      new Intl.NumberFormat(intl, { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v),
    [intl],
  );
  const int = (v: number) => new Intl.NumberFormat(intl).format(v);
  const compact = (v: number) => new Intl.NumberFormat(intl, { notation: "compact", maximumFractionDigits: 1 }).format(v);
  const pct = (v: number) => new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 1 }).format(v);
  const { totals } = report;
  const present = VENDORS.filter((v) => report.by_day.some((d) => d[v] > 0) || report.by_model.some((m) => m.vendor === v));

  const tiles = [
    { key: "spend", value: usd(totals.cost_usd), hint: t("tiles.spendHint", { calls: totals.calls }) },
    { key: "perPhoto", value: totals.cost_per_photo !== null ? usd(totals.cost_per_photo) : "—", hint: t("tiles.perPhotoHint") },
    { key: "photos", value: int(totals.photos), hint: t("tiles.photosHint", { runs: totals.runs, failed: totals.failed_runs }) },
    { key: "tokens", value: compact(totals.input_tokens + totals.output_tokens), hint: t("tiles.tokensHint", { input: compact(totals.input_tokens), output: compact(totals.output_tokens) }) },
  ];

  return (
    <div className="cost-viz flex flex-col gap-5">
      <style>{STYLE}</style>

      <nav aria-label={t("periodLabel")} className="flex flex-wrap gap-1.5">
        {PERIODS.map((p) => {
          const active = (report.period.days ?? null) === p.days;
          return (
            <Link
              key={p.key}
              href={p.days ? `/costs?days=${p.days}` : "/costs"}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center rounded-lg border px-3 text-[0.75rem] font-medium transition-colors",
                active ? "border-foreground bg-foreground text-background" : "border-line-strong bg-surface text-foreground hover:border-evidence hover:text-evidence",
              )}
            >
              {t(`periods.${p.key}`)}
            </Link>
          );
        })}
      </nav>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.key} className="flex min-w-0 flex-col gap-1.5 bg-surface px-4 py-4">
            <dt className="truncate text-[0.75rem] text-muted">{t(`tiles.${tile.key}`)}</dt>
            <dd className="font-display text-[clamp(1.375rem,1.1rem+1vw,1.875rem)] font-semibold leading-none tabular-nums tracking-[-0.02em] text-foreground-strong">
              {tile.value}
            </dd>
            <dd className="text-[0.6875rem] leading-snug text-muted-2">{tile.hint}</dd>
          </div>
        ))}
      </dl>

      <DailySpend report={report} vendors={present} usd={usd} />

      <div className="flex flex-col gap-5">
        <section aria-labelledby="by-model" className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
          <Heading id="by-model" title={t("byModel.title")} hint={t("byModel.hint")} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-[0.75rem]">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">{t("byModel.model")}</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{t("byModel.share")}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t("byModel.calls")}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t("byModel.tokens")}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t("byModel.price")}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t("byModel.perCall")}</th>
                  <th scope="col" className="py-2 text-right font-medium">{t("byModel.cost")}</th>
                </tr>
              </thead>
              <tbody>
                {report.by_model.map((m) => (
                  <tr key={m.label} className="border-b border-line/60 align-middle">
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: `var(--v-${m.vendor})` }} />
                        <span className="min-w-0">
                          <span className="block truncate text-foreground">{m.label}</span>
                          <span className="block truncate text-[0.6875rem] text-muted-2">{t(`vendors.${m.vendor}`)}</span>
                        </span>
                      </span>
                    </th>
                    <td className="w-[22%] py-2 pr-3">
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-strong/40">
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(m.share * 100, 1)}%`, background: `var(--v-${m.vendor})` }} />
                        </span>
                        <span className="w-11 text-right font-mono tabular-nums text-muted">{pct(m.share)}</span>
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{int(m.calls)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right font-mono tabular-nums text-muted">
                      {compact(m.input_tokens)} / {compact(m.output_tokens)}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right font-mono tabular-nums text-muted">
                      {m.price_in_per_mtok !== null && m.price_out_per_mtok !== null
                        ? `${usd(m.price_in_per_mtok)} / ${usd(m.price_out_per_mtok)}`
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right font-mono tabular-nums">{m.cost_per_call !== null ? usd(m.cost_per_call, 3) : "—"}</td>
                    <td className="whitespace-nowrap py-2 text-right font-mono font-medium tabular-nums text-foreground-strong">{usd(m.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-foreground-strong">
                  <th scope="row" colSpan={6} className="py-2 pr-3 text-left font-medium">{t("byModel.total")}</th>
                  <td className="py-2 text-right font-mono font-semibold tabular-nums">{usd(totals.cost_usd)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[0.6875rem] text-muted-2">{t("byModel.priceHint")}</p>
        </section>

        <section aria-labelledby="by-stage" className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
          <Heading id="by-stage" title={t("byStage.title")} hint={t("byStage.hint")} />
          <ul className="flex flex-col gap-2.5">
            {report.by_stage.map((s) => (
              <li key={s.stage} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-[0.75rem]">
                  <span className="truncate text-foreground">{stageLabel(t, s.stage)}</span>
                  <span className="shrink-0 font-mono tabular-nums text-foreground-strong">{usd(s.cost_usd)}</span>
                </div>
                <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-line-strong/40">
                  <span className="block h-full rounded-full bg-evidence" style={{ width: `${Math.max(s.share * 100, s.cost_usd > 0 ? 1 : 0)}%` }} />
                </span>
                <span className="text-[0.6875rem] text-muted-2">
                  {t("byStage.meta", { calls: s.calls, share: pct(s.share), seconds: s.avg_seconds ?? 0 })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="by-batch" className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
          <Heading id="by-batch" title={t("byBatch.title")} hint={t("byBatch.hint")} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-[0.75rem]">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">{t("byBatch.batch")}</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{t("byBatch.created")}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t("byBatch.photos")}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t("byBatch.failed")}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t("byBatch.perPhoto")}</th>
                  <th scope="col" className="py-2 text-right font-medium">{t("byBatch.cost")}</th>
                </tr>
              </thead>
              <tbody>
                {report.by_batch.map((b) => (
                  <tr key={b.batch_id ?? "withdrawn"} className="border-b border-line/60">
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      {b.batch_id ? (
                        <Link href={`/batches/${b.batch_id}`} className="font-mono text-evidence hover:underline">
                          {b.label ?? t("byBatch.unlabelled")}
                        </Link>
                      ) : (
                        <span className="text-muted">{t("byBatch.withdrawnGroup")}</span>
                      )}
                      {b.withdrawn && b.batch_id && (
                        <span className="ml-2 text-[0.6875rem] text-muted-2">{t("byBatch.withdrawn")}</span>
                      )}
                    </th>
                    <td className="py-2 pr-3 text-muted">
                      {b.created_at
                        ? new Intl.DateTimeFormat(intl, { timeZone: ARCHIVE_TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(b.created_at))
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{int(b.photos)}</td>
                    <td className={cn("py-2 pr-3 text-right font-mono tabular-nums", b.failed_runs ? "text-refuted" : "text-muted")}>{int(b.failed_runs)}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{b.cost_per_photo !== null ? usd(b.cost_per_photo) : "—"}</td>
                    <td className="py-2 text-right font-mono font-medium tabular-nums text-foreground-strong">{usd(b.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="projection" className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
          <Heading id="projection" title={t("projection.title")} hint={t("projection.hint")} />
          {report.projection.cost_per_photo === null ? (
            <p className="text-[0.8125rem] text-muted">{t("projection.none")}</p>
          ) : (
            <dl className="flex flex-col divide-y divide-line">
              {[
                { key: "prio1", value: report.projection.prio1_set },
                { key: "delivery", value: report.projection.delivery_600 },
                { key: "collection", value: report.projection.collection_200000 },
              ].map((row) => (
                <div key={row.key} className="flex items-baseline justify-between gap-3 py-2.5">
                  <dt className="text-[0.8125rem] text-foreground">{t(`projection.${row.key}`)}</dt>
                  <dd className="font-display text-[1.125rem] font-semibold tabular-nums text-foreground-strong">
                    {row.value !== null ? usd(row.value, row.key === "collection" ? 0 : 2) : "—"}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-[0.6875rem] leading-relaxed text-muted-2">{t("projection.caveat")}</p>
        </section>
      </div>

      <aside className="flex gap-2.5 rounded-[var(--radius-card)] border border-line bg-surface-2 p-3.5 text-[0.75rem] leading-relaxed text-muted">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
        <p>
          {t("footnote", {
            tools: report.unmetered.map((u) => t(`unmetered.${u}`)).join(", "),
          })}
        </p>
      </aside>
    </div>
  );
}

function Heading({ id, title, hint }: { id: string; title: string; hint: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h2 id={id} className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong">
        {title}
      </h2>
      <p className="max-w-[78ch] text-[0.75rem] leading-relaxed text-muted">{hint}</p>
    </div>
  );
}

const STAGES = new Set(["perception", "research", "sighting", "reference", "check", "adjudicate", "grounding", "resolve"]);
function stageLabel(t: ReturnType<typeof useTranslations>, stage: string): string {
  return STAGES.has(stage) ? t(`stages.${stage}`) : stage;
}

/**
 * Spend per Swiss day, stacked by vendor. Columns ≤ 24 px with a 2 px surface gap
 * between segments, 4 px rounded top; a hover tooltip per day; a table view.
 */
function DailySpend({ report, vendors, usd }: { report: CostReport; vendors: CostVendor[]; usd: (v: number, d?: number) => string }) {
  const t = useTranslations("costs");
  const intl = intlLocale(useLocale());
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const days = report.by_day;
  const max = Math.max(...days.map((d) => d.total), 0);
  const step = niceStep(max / 4);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const W = 720;
  const H = 240;
  const pad = { l: 52, r: 12, t: 12, b: 28 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const band = days.length ? plotW / days.length : plotW;
  const barW = Math.min(24, band * 0.62);
  const y = (v: number) => pad.t + plotH - (top ? (v / top) * plotH : 0);
  const dayLabel = (iso: string, long = false) =>
    new Intl.DateTimeFormat(intl, { timeZone: "UTC", day: "numeric", month: long ? "long" : "short", ...(long ? { weekday: "short" } : {}) }).format(new Date(`${iso}T12:00:00Z`));
  const every = Math.max(1, Math.ceil(days.length / 8));
  const hovered = hover !== null ? days[hover] : null;

  return (
    <section aria-labelledby="daily" className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Heading id="daily" title={t("daily.title")} hint={t("daily.hint")} />
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-[0.75rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence"
        >
          {asTable ? <BarChart3 aria-hidden className="size-3.5" /> : <Table2 aria-hidden className="size-3.5" />}
          {asTable ? t("daily.asChart") : t("daily.asTable")}
        </button>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-muted" aria-label={t("daily.legend")}>
        {vendors.map((v) => (
          <li key={v} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: `var(--v-${v})` }} />
            {t(`vendors.${v}`)}
          </li>
        ))}
      </ul>

      {days.length === 0 ? (
        <p className="text-[0.8125rem] text-muted">{t("daily.empty")}</p>
      ) : asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-[0.75rem]">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">{t("daily.day")}</th>
                {vendors.map((v) => (
                  <th key={v} scope="col" className="py-2 pr-3 text-right font-medium">{t(`vendors.${v}`)}</th>
                ))}
                <th scope="col" className="py-2 text-right font-medium">{t("daily.total")}</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day} className="border-b border-line/60">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-foreground">{dayLabel(d.day, true)}</th>
                  {vendors.map((v) => (
                    <td key={v} className="py-1.5 pr-3 text-right font-mono tabular-nums text-muted">{usd(d[v])}</td>
                  ))}
                  <td className="py-1.5 text-right font-mono font-medium tabular-nums text-foreground-strong">{usd(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t("daily.aria", { days: days.length })}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} stroke="var(--grid)" strokeWidth={1} />
                <text x={pad.l - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-[var(--color-muted)] text-[10px]" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {usd(tick, step < 1 ? 2 : 0)}
                </text>
              </g>
            ))}
            {days.map((d, i) => {
              const x = pad.l + band * i + (band - barW) / 2;
              let base = d.total;
              const segments = vendors
                .filter((v) => d[v] > 0)
                .map((v) => {
                  const segTop = y(base);
                  const h = y(base - d[v]) - segTop;
                  base -= d[v];
                  return { v, segTop, h };
                });
              return (
                <g key={d.day}>
                  {segments.map((s, k) => {
                    const isTop = k === 0;
                    const h = Math.max(0, s.h - (k < segments.length - 1 ? 2 : 0));
                    if (h <= 0) return null;
                    return isTop ? (
                      <path
                        key={s.v}
                        d={roundedTop(x, s.segTop, barW, h, Math.min(4, h, barW / 2))}
                        fill={`var(--v-${s.v})`}
                        opacity={hover === null || hover === i ? 1 : 0.45}
                      />
                    ) : (
                      <rect key={s.v} x={x} y={s.segTop} width={barW} height={h} fill={`var(--v-${s.v})`} opacity={hover === null || hover === i ? 1 : 0.45} />
                    );
                  })}
                  {i % every === 0 && (
                    <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="fill-[var(--color-muted)] text-[10px]">
                      {dayLabel(d.day)}
                    </text>
                  )}
                  <rect
                    x={pad.l + band * i}
                    y={pad.t}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    tabIndex={0}
                    aria-label={`${dayLabel(d.day, true)}: ${usd(d.total)}`}
                  />
                </g>
              );
            })}
            <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} />
          </svg>
          {hovered && hover !== null && (
            <div
              role="status"
              className="pointer-events-none absolute top-1 z-10 min-w-[11rem] -translate-x-1/2 rounded-lg border border-line bg-surface-raised px-3 py-2 text-[0.75rem] shadow-lg"
              style={{ left: `${((pad.l + band * hover + band / 2) / W) * 100}%` }}
            >
              <p className="font-medium text-foreground-strong">{dayLabel(hovered.day, true)}</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {vendors
                  .filter((v) => hovered[v] > 0)
                  .map((v) => (
                    <li key={v} className="flex items-center justify-between gap-3 text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="size-2 rounded-sm" style={{ background: `var(--v-${v})` }} />
                        {t(`vendors.${v}`)}
                      </span>
                      <span className="font-mono tabular-nums text-foreground">{usd(hovered[v])}</span>
                    </li>
                  ))}
              </ul>
              <p className="mt-1 flex justify-between gap-3 border-t border-line pt-1 font-medium text-foreground-strong">
                <span>{t("daily.total")}</span>
                <span className="font-mono tabular-nums">{usd(hovered.total)}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** A round tick step (1, 2, 5 × 10ⁿ) so the axis reads 0 / 5 / 10, never 6.25. */
function niceStep(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * exp;
}

function roundedTop(x: number, yTop: number, w: number, h: number, r: number): string {
  return `M${x},${yTop + h} L${x},${yTop + r} Q${x},${yTop} ${x + r},${yTop} L${x + w - r},${yTop} Q${x + w},${yTop} ${x + w},${yTop + r} L${x + w},${yTop + h} Z`;
}
