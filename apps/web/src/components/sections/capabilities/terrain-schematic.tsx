"use client";

import { useTranslations } from "next-intl";
import { CAMERA_POSE } from "@/lib/data/horizon";
import { smoothPath } from "@/lib/path";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/cn";

const W = 400;
const H = 200;
const CAMERA = { x: 40, y: 166 };

/**
 * A terrain profile, as elevation samples rather than a drawn curve — so the
 * rays can be aimed at real samples and terminate exactly on the ridge. A ray
 * that flies past the skyline into empty sky is not what a horizon ray-cast
 * does, and an engineer in the room will notice.
 */
const PROFILE: readonly (readonly [number, number])[] = [
  [0, 172], [28, 168], [56, 170], [84, 162], [112, 152], [140, 136],
  [168, 112], [196, 82], [224, 54], [252, 88], [280, 116], [308, 124],
  [336, 128], [364, 140], [400, 148],
].map(([x, y]) => [x / W, y / H] as const);

const PROFILE_PATH = smoothPath(PROFILE, W, H);
const AREA_PATH = `${PROFILE_PATH} L ${W} ${H} L 0 ${H} Z`;

/** Sample the profile to the right of the camera — one ray per azimuth. */
const RAY_TARGETS = PROFILE.map(([x, y]) => [x * W, y * H] as const).filter(
  ([x]) => x > CAMERA.x + 18,
);

export function TerrainSchematic() {
  const t = useTranslations("capabilities.items.terrain");
  const tf = useTranslations("falsifier");
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.35 });

  return (
    <div ref={ref} className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-[0.625rem] border border-line bg-[#071320]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={t("tagline")}
        >
          <defs>
            <linearGradient id="dem-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2a5177" />
              <stop offset="100%" stopColor="#0d2032" />
            </linearGradient>
          </defs>

          {/* elevation model */}
          <path d={AREA_PATH} fill="url(#dem-fill)" />
          <g stroke="#3d6b93" strokeWidth="0.5" opacity="0.45">
            {Array.from({ length: 17 }, (_, i) => (
              <line key={i} x1={i * 25} y1={H} x2={i * 25} y2={H - 46} />
            ))}
          </g>

          {/* one ray per azimuth, each ending on the terrain sample it hits */}
          <g>
            {RAY_TARGETS.map(([x, y], i) => (
              <line
                key={x}
                x1={CAMERA.x}
                y1={CAMERA.y}
                x2={x}
                y2={y}
                stroke="#17a2de"
                strokeWidth="0.85"
                opacity={inView ? 0.45 : 0}
                style={{ transition: `opacity 480ms var(--ease-archival) ${i * 60}ms` }}
              />
            ))}
          </g>

          {/* the maxima, joined: the synthetic horizon ĥ(θ) */}
          <path
            d={PROFILE_PATH}
            fill="none"
            stroke="#5cc9f5"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1000}
            strokeDasharray={1000}
            style={{
              strokeDashoffset: inView ? 0 : 1000,
              transition: "stroke-dashoffset 1.6s var(--ease-archival) 500ms",
              filter: "drop-shadow(0 0 4px rgb(23 162 222 / 0.6))",
            }}
          />

          {/* where the ray-cast starts */}
          <circle cx={CAMERA.x} cy={CAMERA.y} r="11" fill="#17a2de" opacity="0.16" />
          <circle cx={CAMERA.x} cy={CAMERA.y} r="3.6" fill="#5cc9f5" />

          <text
            x={CAMERA.x}
            y={H - 6}
            textAnchor="middle"
            className="fill-[#7fa8c4] font-mono"
            fontSize="7.5"
          >
            {CAMERA_POSE.lv95.easting} / {CAMERA_POSE.lv95.northing}
          </text>
          <text
            x={W - 12}
            y={38}
            textAnchor="end"
            className="fill-[#5cc9f5] font-mono"
            fontSize="9"
          >
            {"ĥ(θ)"}
          </text>
        </svg>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {[
          { label: tf("correlation"), value: CAMERA_POSE.correlation.toFixed(3), good: true },
          { label: tf("bearing"), value: `${CAMERA_POSE.bearing}°`, good: false },
          { label: tf("accuracy"), value: `±${CAMERA_POSE.accuracyMetres} m`, good: false },
        ].map((row) => (
          <div key={row.label} className="min-w-0 rounded-lg border border-line bg-surface/60 px-2.5 py-2">
            <dt className="font-mono text-[0.5rem] uppercase leading-tight tracking-[0.1em] text-muted-2">
              {row.label}
            </dt>
            <dd className={cn("font-mono text-[0.8125rem] tabular-nums", row.good ? "text-corroborated" : "text-foreground")}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
