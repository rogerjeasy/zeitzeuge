"use client";

import { useTranslations } from "next-intl";
import { Compass, MapPinOff } from "lucide-react";
import { SUMMITS } from "@/lib/data/horizon";
import type { CaseFile } from "@/lib/data/editor";
import { cn } from "@/lib/cn";

const R = 62;
const CX = 80;
const CY = 80;

/** Bearing in degrees clockwise from north → a point on the plan. */
function onCircle(bearing: number, radius: number) {
  const rad = ((bearing - 90) * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

/**
 * Where the camera stood, as an azimuth plan rather than a basemap.
 *
 * The pipeline resolves a position and a bearing; it does not resolve a
 * distance to each summit, so nothing here is drawn to scale and the plan says
 * as much by being a compass. Putting these rays on a map would imply a
 * measurement that was never taken — the one kind of polish this product is
 * built to refuse. The swisstopo basemap lands here once the tile layer does.
 */
export function MapTab({
  record,
  showHorizon,
  onToggleHorizon,
}: {
  record: CaseFile;
  showHorizon: boolean;
  onToggleHorizon: (next: boolean) => void;
}) {
  const t = useTranslations("editor.map");
  const pose = record.camera;

  if (!pose) {
    return (
      <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
        <span className="grid size-11 place-items-center rounded-xl bg-abstain-soft text-abstain">
          <MapPinOff aria-hidden className="size-5" strokeWidth={1.8} />
        </span>
        <p className="font-display text-[1rem] text-foreground-strong">
          {t("unresolvedTitle")}
        </p>
        <p className="max-w-[44ch] text-[0.8125rem] leading-relaxed text-muted">
          {t("unresolvedBody")}
        </p>
      </div>
    );
  }

  const half = pose.hfov / 2;
  const left = onCircle(pose.bearing - half, R);
  const right = onCircle(pose.bearing + half, R);
  const axis = onCircle(pose.bearing, R + 6);
  const largeArc = pose.hfov > 180 ? 1 : 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-[0.8125rem] leading-relaxed text-muted">{t("hint")}</p>

      <div className="flex flex-col items-center gap-3 rounded-[0.625rem] border border-line bg-[#071320] p-3 @lg:flex-row @lg:items-start @lg:gap-4">
        <svg
          viewBox="0 0 160 160"
          role="img"
          aria-label={`${t("bearing")} ${pose.bearing}°, ${t("fov")} ${pose.hfov}°`}
          className="h-auto w-full max-w-[13rem] shrink-0 @lg:w-40"
        >
          {/* accuracy ring and the graticule it sits in */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#2a4a68" strokeWidth="0.8" />
          <circle cx={CX} cy={CY} r={R * 0.62} fill="none" stroke="#1f3a53" strokeWidth="0.6" strokeDasharray="2 3" />
          <circle cx={CX} cy={CY} r={R * 0.3} fill="none" stroke="#1f3a53" strokeWidth="0.6" strokeDasharray="2 3" />

          {/* the field of view */}
          <path
            d={`M ${CX} ${CY} L ${left.x} ${left.y} A ${R} ${R} 0 ${largeArc} 1 ${right.x} ${right.y} Z`}
            fill="rgb(23 162 222 / 0.22)"
            stroke="#17a2de"
            strokeWidth="0.9"
          />
          <line
            x1={CX} y1={CY} x2={axis.x} y2={axis.y}
            stroke="#5cc9f5" strokeWidth="1.1" strokeDasharray="3 2"
          />

          {/* what the falsifier actually named on the skyline */}
          {SUMMITS.map((summit) => {
            const p = onCircle(summit.bearing, R);
            const label = onCircle(summit.bearing, R + 13);
            return (
              <g key={summit.id}>
                <path
                  d={`M ${p.x - 4} ${p.y + 3.2} L ${p.x} ${p.y - 3.6} L ${p.x + 4} ${p.y + 3.2} Z`}
                  fill="#5cc9f5"
                />
                <text
                  x={label.x} y={label.y}
                  textAnchor={summit.bearing > 180 ? "end" : "start"}
                  dominantBaseline="middle"
                  className="fill-[#9fc4dc] font-mono"
                  fontSize="6.2"
                >
                  {summit.bearing.toFixed(1)}°
                </text>
              </g>
            );
          })}

          {/* the camera */}
          <circle cx={CX} cy={CY} r="9" fill="#17a2de" opacity="0.16" />
          <circle cx={CX} cy={CY} r="3.2" fill="#5cc9f5" />

          {(["N", "E", "S", "W"] as const).map((dir, i) => {
            const p = onCircle(i * 90, R + 10);
            return (
              <text
                key={dir}
                x={p.x} y={p.y}
                textAnchor="middle" dominantBaseline="middle"
                className="fill-[#6d90ab] font-mono" fontSize="7"
              >
                {dir}
              </text>
            );
          })}
        </svg>

        <dl className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 text-[0.75rem]">
          <Row label={t("coords")} value={`${pose.lv95.easting} / ${pose.lv95.northing}`} sub="LV95" />
          <Row
            label="WGS 84"
            value={`${pose.wgs84.lat.toFixed(4)}, ${pose.wgs84.lon.toFixed(4)}`}
            sub={`${pose.groundElevation} + ${pose.eyeHeight} m`}
          />
          <Row label={t("bearing")} value={`${pose.bearing}° ${pose.tilt > 0 ? "+" : ""}${pose.tilt}°`} />
          <Row label={t("fov")} value={`${pose.hfov}°`} />
          <Row label={t("accuracy")} value={`± ${pose.accuracyMetres} m`} />
          <Row
            label={t("correlation")}
            value={pose.correlation.toFixed(3)}
            sub={`n = ${pose.columns}`}
            strong
          />
        </dl>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface-2/50 px-3 py-2.5">
        <input
          type="checkbox"
          checked={showHorizon}
          onChange={(event) => onToggleHorizon(event.target.checked)}
          className="size-4 shrink-0 accent-[var(--evidence)]"
        />
        <span className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-foreground">
          <Compass aria-hidden className="size-3.5 shrink-0 text-muted-2" strokeWidth={1.9} />
          {t("overlayToggle")}
        </span>
      </label>
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  strong,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <>
      <dt className="whitespace-nowrap font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-[#7fa8c4]">
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 break-words font-mono text-[0.6875rem] tabular-nums",
          strong ? "text-[#5cc9f5]" : "text-[#d8e6f0]",
        )}
      >
        {value}
        {sub && <span className="ml-1.5 text-[0.5625rem] text-[#6d90ab]">{sub}</span>}
      </dd>
    </>
  );
}
