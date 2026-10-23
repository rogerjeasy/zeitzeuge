"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RELIABILITY } from "@/lib/data/calibration";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/cn";

const PAD = { top: 26, right: 18, bottom: 32, left: 42 };
const W = 420;
const H = 320;
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const sx = (v: number) => PAD.left + ((v - 0.4) / 0.6) * PLOT_W;
const sy = (v: number) => PAD.top + (1 - (v - 0.3) / 0.7) * PLOT_H;

const line = (key: "observed" | "baseline") =>
  RELIABILITY.map((b, i) => `${i === 0 ? "M" : "L"} ${sx(b.stated)} ${sy(b[key])}`).join(" ");

const X_TICKS = [0.4, 0.55, 0.7, 0.85, 1.0];
const Y_TICKS = [0.3, 0.5, 0.7, 0.9, 1.0];

/**
 * Reliability diagram. One axis, two series, a dashed reference diagonal for
 * perfect calibration. The reading is the vertical distance from that diagonal:
 * ZEITZEUGE tracks it; a single model call sits far below it, which is what
 * overconfidence looks like once you plot it.
 */
export function ReliabilityChart() {
  const t = useTranslations("calibration");
  const locale = useLocale();
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3 });
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();

  const fmt = (v: number) =>
    new Intl.NumberFormat(locale === "de" ? "de-CH" : locale, {
      style: "percent",
      maximumFractionDigits: 0,
    }).format(v);

  const active = hover !== null ? RELIABILITY[hover] : null;

  return (
    <div ref={ref} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <h3 id={titleId} className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong">
          {t("chartTitle")}
        </h3>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {[
            { label: t("observed"), color: "var(--chart-1)", dash: false },
            { label: t("baseline"), color: "var(--chart-2)", dash: false },
            { label: t("perfect"), color: "var(--chart-reference)", dash: true },
          ].map((item) => (
            <li key={item.label} className="flex items-center gap-1.5 font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-muted">
              <svg width="14" height="3" aria-hidden className="shrink-0 overflow-visible">
                <line x1="0" y1="1.5" x2="14" y2="1.5" stroke={item.color} strokeWidth="2" strokeDasharray={item.dash ? "3 2" : undefined} />
              </svg>
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative rounded-[0.625rem] border border-line bg-surface p-2 sm:p-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-labelledby={titleId}
          onMouseLeave={() => setHover(null)}
        >
          <g stroke="var(--chart-grid)" strokeWidth="1">
            {Y_TICKS.map((v) => (
              <line key={v} x1={PAD.left} y1={sy(v)} x2={W - PAD.right} y2={sy(v)} />
            ))}
          </g>

          <g className="fill-muted-2 font-mono" fontSize="8.5">
            {Y_TICKS.map((v) => (
              <text key={v} x={PAD.left - 6} y={sy(v) + 3} textAnchor="end">{fmt(v)}</text>
            ))}
            {X_TICKS.map((v) => (
              <text key={v} x={sx(v)} y={H - PAD.bottom + 14} textAnchor="middle">{fmt(v)}</text>
            ))}
            <text x={W - PAD.right} y={H - 4} textAnchor="end">{t("chartAxisX")}</text>
            <text x={PAD.left - 34} y={12} textAnchor="start">{t("chartAxisY")}</text>
          </g>

          <line x1={sx(0.4)} y1={sy(0.4)} x2={sx(1)} y2={sy(1)} stroke="var(--chart-reference)" strokeWidth="2" strokeDasharray="4 3" />

          {(["baseline", "observed"] as const).map((key, i) => (
            <path
              key={key}
              d={line(key)}
              fill="none"
              stroke={key === "observed" ? "var(--chart-1)" : "var(--chart-2)"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1000}
              strokeDasharray={1000}
              style={{
                strokeDashoffset: inView ? 0 : 1000,
                transition: `stroke-dashoffset 1.3s var(--ease-archival) ${i * 200}ms`,
              }}
            />
          ))}

          {RELIABILITY.map((bin, i) =>
            (["baseline", "observed"] as const).map((key) => (
              <circle
                key={`${key}-${bin.stated}`}
                cx={sx(bin.stated)}
                cy={sy(bin[key])}
                r={hover === i ? 5 : 4}
                fill={key === "observed" ? "var(--chart-1)" : "var(--chart-2)"}
                stroke="var(--surface)"
                strokeWidth="2"
                style={{
                  opacity: inView ? 1 : 0,
                  transition: `opacity 400ms var(--ease-archival) ${600 + i * 60}ms, r 150ms`,
                }}
              />
            )),
          )}

          {/* Direct labels sit where the curves are furthest apart, so the
              identity of each line is readable without the legend. */}
          <g className="font-mono" fontSize="9" style={{ opacity: inView ? 1 : 0, transition: "opacity 500ms 0.85s" }}>
            <text x={sx(0.78)} y={sy(0.83) - 8} textAnchor="middle" fill="var(--chart-1)">
              {t("observed")}
            </text>
            <text x={sx(0.775)} y={sy(0.45)} textAnchor="middle" fill="var(--chart-2)">
              {t("baseline")}
            </text>
          </g>

          {RELIABILITY.map((bin, i) => (
            <rect
              key={`hit-${bin.stated}`}
              x={sx(bin.stated) - PLOT_W / 12}
              y={PAD.top}
              width={PLOT_W / 6}
              height={PLOT_H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}

          {hover !== null && (
            <line
              x1={sx(RELIABILITY[hover].stated)}
              y1={PAD.top}
              x2={sx(RELIABILITY[hover].stated)}
              y2={PAD.top + PLOT_H}
              stroke="var(--chart-grid)"
              strokeWidth="1.5"
            />
          )}
        </svg>

        <div
          className={cn(
            "pointer-events-none absolute left-4 top-4 rounded-lg border border-line bg-background/95 px-2.5 py-2 shadow-plate backdrop-blur-sm transition-opacity duration-150",
            active ? "opacity-100" : "opacity-0",
          )}
        >
          {active && (
            <>
              <p className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
                {t("binLabel")} {fmt(active.stated)}
              </p>
              <p className="mt-1 flex items-center gap-1.5 font-mono text-[0.6875rem] tabular-nums text-foreground">
                <span aria-hidden className="size-1.5 rounded-full" style={{ background: "var(--chart-1)" }} />
                {t("observed")} {fmt(active.observed)}
              </p>
              <p className="flex items-center gap-1.5 font-mono text-[0.6875rem] tabular-nums text-foreground">
                <span aria-hidden className="size-1.5 rounded-full" style={{ background: "var(--chart-2)" }} />
                {t("baseline")} {fmt(active.baseline)}
              </p>
            </>
          )}
        </div>
      </div>

      <details className="group">
        <summary className="cursor-pointer list-none font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted transition-colors hover:text-foreground">
          <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>{" "}
          {t("tableView")}
        </summary>
        <table className="mt-3 w-full border-collapse text-left font-mono text-[0.6875rem] tabular-nums">
          <thead>
            <tr className="border-b border-line text-muted-2">
              <th scope="col" className="py-1.5 pr-3 font-normal">{t("chartAxisX")}</th>
              <th scope="col" className="py-1.5 pr-3 font-normal">{t("observed")}</th>
              <th scope="col" className="py-1.5 font-normal">{t("baseline")}</th>
            </tr>
          </thead>
          <tbody>
            {RELIABILITY.map((bin) => (
              <tr key={bin.stated} className="border-b border-line/60 text-muted">
                <th scope="row" className="py-1.5 pr-3 font-normal text-foreground">{fmt(bin.stated)}</th>
                <td className="py-1.5 pr-3">{fmt(bin.observed)}</td>
                <td className="py-1.5">{fmt(bin.baseline)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
