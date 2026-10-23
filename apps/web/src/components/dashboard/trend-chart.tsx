"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { TrendingDown, TrendingUp } from "lucide-react";
import { TREND, type TrendPoint } from "@/lib/data/dashboard";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/cn";

/**
 * Small multiples, not a shared axis.
 *
 * Precision sits near 94 % and the correction rate near 9 %. Plotted together
 * on one 0–100 axis both become flat lines and the trend — the entire point —
 * disappears. Two panels, each with a domain fitted to its own series and its
 * range stated on the axis, show the movement honestly. Hovering either panel
 * crosshairs both, so they still read as one measurement.
 */
const W = 620;
const H = 116;
const PAD = { top: 14, right: 14, bottom: 12, left: 42 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

interface Series {
  key: "precision" | "override";
  labelKey: string;
  color: string;
  domain: [number, number];
  /** Which direction is the good one, for the trailing indicator. */
  fallingIsGood: boolean;
}

const SERIES: Series[] = [
  { key: "precision", labelKey: "trendPrecision", color: "var(--chart-1)", domain: [86, 96], fallingIsGood: false },
  { key: "override", labelKey: "trendOverride", color: "var(--chart-2)", domain: [6, 16], fallingIsGood: true },
];

const sx = (i: number) => PAD.left + (i / (TREND.length - 1)) * PLOT_W;

export function TrendChart() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [hover, setHover] = useState<number | null>(null);

  const intl = locale === "de" ? "de-CH" : locale;
  const pct = (v: number) =>
    `${new Intl.NumberFormat(intl, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)} %`;
  const day = (iso: string) =>
    new Intl.DateTimeFormat(intl, { day: "2-digit", month: "short" }).format(new Date(iso));

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong">
          {t("trendTitle")}
        </h2>
        <p className="max-w-[62ch] text-[0.75rem] leading-snug text-muted">
          {t("trendSubtitle")}
        </p>
      </div>

      <div className="flex flex-col gap-3" onMouseLeave={() => setHover(null)}>
        {SERIES.map((series) => (
          <TrendPanel
            key={series.key}
            series={series}
            hover={hover}
            onHover={setHover}
            pct={pct}
          />
        ))}
      </div>

      <div className="flex items-center justify-between pl-[6%] font-mono text-[0.625rem] text-muted-2">
        <span>{day(TREND[0].day)}</span>
        {hover !== null && (
          <span className="text-foreground">{day(TREND[hover].day)}</span>
        )}
        <span>{day(TREND[TREND.length - 1].day)}</span>
      </div>

      <details className="group">
        <summary className="cursor-pointer list-none font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted transition-colors hover:text-foreground">
          <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>{" "}
          {t("trendTable")}
        </summary>
        <div className="mt-3 max-h-52 overflow-y-auto">
          <table className="w-full border-collapse text-left font-mono text-[0.6875rem] tabular-nums">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line text-muted-2">
                <th scope="col" className="py-1.5 pr-3 font-normal">{t("trendDay")}</th>
                <th scope="col" className="py-1.5 pr-3 font-normal">{t("trendPrecision")}</th>
                <th scope="col" className="py-1.5 font-normal">{t("trendOverride")}</th>
              </tr>
            </thead>
            <tbody>
              {TREND.map((p) => (
                <tr key={p.day} className="border-b border-line/60 text-muted">
                  <th scope="row" className="py-1.5 pr-3 font-normal text-foreground">{day(p.day)}</th>
                  <td className="py-1.5 pr-3">{pct(p.precision)}</td>
                  <td className="py-1.5">{pct(p.override)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function TrendPanel({
  series,
  hover,
  onHover,
  pct,
}: {
  series: Series;
  hover: number | null;
  onHover: (i: number | null) => void;
  pct: (v: number) => string;
}) {
  const t = useTranslations("dashboard");
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.2 });
  const titleId = useId();

  const [min, max] = series.domain;
  const sy = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * PLOT_H;
  const path = TREND.map(
    (p, i) => `${i === 0 ? "M" : "L"} ${sx(i).toFixed(1)} ${sy(p[series.key]).toFixed(1)}`,
  ).join(" ");
  const area = `${path} L ${sx(TREND.length - 1)} ${PAD.top + PLOT_H} L ${PAD.left} ${PAD.top + PLOT_H} Z`;

  const first = TREND[0][series.key];
  const last = TREND[TREND.length - 1][series.key];
  const change = last - first;
  const improving = series.fallingIsGood ? change < 0 : change > 0;
  const Arrow = change < 0 ? TrendingDown : TrendingUp;
  const gradientId = `${titleId}-fill`;

  return (
    <div ref={ref} className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span id={titleId} className="flex items-center gap-1.5 text-[0.75rem] font-medium text-muted">
          <span aria-hidden className="size-1.5 rounded-full" style={{ background: series.color }} />
          {t(series.labelKey)}
        </span>
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[0.8125rem] font-semibold tabular-nums text-foreground-strong">
            {pct(hover !== null ? TREND[hover][series.key] : last)}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-mono text-[0.625rem] tabular-nums",
              improving ? "text-corroborated" : "text-review",
            )}
          >
            <Arrow aria-hidden className="size-3" strokeWidth={2.2} />
            {Math.abs(change).toFixed(1)} pp
          </span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-labelledby={titleId}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={series.color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={series.color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* the domain is focused, so both bounds are written on the axis */}
        <g stroke="var(--chart-grid)" strokeWidth="1">
          <line x1={PAD.left} y1={sy(max)} x2={W - PAD.right} y2={sy(max)} />
          <line x1={PAD.left} y1={sy(min)} x2={W - PAD.right} y2={sy(min)} />
        </g>
        <g className="fill-muted-2 font-mono" fontSize="8.5">
          <text x={PAD.left - 6} y={sy(max) + 3} textAnchor="end">{max}%</text>
          <text x={PAD.left - 6} y={sy(min) + 3} textAnchor="end">{min}%</text>
        </g>

        <path
          d={area}
          fill={`url(#${gradientId})`}
          style={{ opacity: inView ? 1 : 0, transition: "opacity 700ms 500ms" }}
        />
        <path
          d={path}
          fill="none"
          stroke={series.color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1000}
          strokeDasharray={1000}
          style={{
            strokeDashoffset: inView ? 0 : 1000,
            transition: "stroke-dashoffset 1.1s var(--ease-archival)",
          }}
        />

        {hover !== null && (
          <>
            <line
              x1={sx(hover)} y1={PAD.top} x2={sx(hover)} y2={PAD.top + PLOT_H}
              stroke="var(--chart-grid)" strokeWidth="1.5"
            />
            <circle
              cx={sx(hover)} cy={sy(TREND[hover][series.key])} r="4"
              fill={series.color} stroke="var(--surface)" strokeWidth="2"
            />
          </>
        )}

        {TREND.map((p: TrendPoint, i) => (
          <rect
            key={p.day}
            x={sx(i) - PLOT_W / (TREND.length * 2)}
            y={0}
            width={PLOT_W / TREND.length}
            height={H}
            fill="transparent"
            onMouseEnter={() => onHover(i)}
          />
        ))}
      </svg>
    </div>
  );
}
