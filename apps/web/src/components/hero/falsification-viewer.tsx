"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw, Crosshair, Check, X } from "lucide-react";
import { CAMERA_POSE, HORIZON_CURVE, SUMMITS } from "@/lib/data/horizon";
import { HERO_PHOTO } from "@/lib/data/archive";
import { jitterCurve, smoothPath } from "@/lib/path";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/cn";

type Stage = "idle" | "skyline" | "raycast" | "match" | "done";

const SCHEDULE: { stage: Stage; at: number }[] = [
  { stage: "skyline", at: 350 },
  { stage: "raycast", at: 1900 },
  { stage: "match", at: 3500 },
  { stage: "done", at: 4700 },
];

const STAGE_ORDER: Stage[] = ["idle", "skyline", "raycast", "match", "done"];
const rank = (s: Stage) => STAGE_ORDER.indexOf(s);

const TRUE_PATH = smoothPath(HORIZON_CURVE);
const EXTRACTED_PATH = smoothPath(jitterCurve(HORIZON_CURVE));

/**
 * The hero demonstration: the photograph's skyline is extracted, the federal
 * elevation model is ray-cast from the hypothesised camera position, and the
 * two curves are correlated. This is a scripted replay of a real pipeline run,
 * not a live one — labelled as such in the caption so nothing is overclaimed.
 */
export function FalsificationViewer() {
  const t = useTranslations("falsifier");
  const tPhotos = useTranslations("archive.photos");
  const reduced = useReducedMotion();
  const [rawStage, setRawStage] = useState<Stage>("idle");
  const [run, setRun] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Reduced motion gets the finished frame, derived rather than stored — the
  // sequence is decoration, the conclusion is the content.
  const stage: Stage = reduced ? "done" : rawStage;

  // Re-runs whenever `run` changes, which is what the replay button bumps.
  useEffect(() => {
    if (reduced) return;
    const scheduled = SCHEDULE.map(({ stage: s, at }) =>
      setTimeout(() => setRawStage(s), at),
    );
    timers.current = scheduled;
    return () => scheduled.forEach(clearTimeout);
  }, [reduced, run]);

  const replay = useCallback(() => {
    timers.current.forEach(clearTimeout);
    setRawStage("idle");
    setRun((r) => r + 1);
  }, []);

  const at = rank(stage);
  const showExtracted = at >= rank("skyline");
  const showTerrain = at >= rank("raycast");
  const matched = at >= rank("match");
  const done = at >= rank("done");

  const stageLabel = t(
    stage === "idle"
      ? "stageIdle"
      : stage === "skyline"
        ? "stageSkyline"
        : stage === "raycast"
          ? "stageRaycast"
          : stage === "match"
            ? "stageMatch"
            : "stageDone",
  );

  return (
    <figure className="relative flex w-full flex-col gap-3">
      {/* ── The plate ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[0.625rem] border border-line-strong bg-surface shadow-lift">
        <div className="relative aspect-[1700/1267] w-full">
          <Image
            src={HERO_PHOTO.accessSrc ?? HERO_PHOTO.src}
            alt={tPhotos(HERO_PHOTO.key)}
            fill
            loading="eager"
            fetchPriority="high"
            sizes="(max-width: 1279px) 100vw, 46vw"
            className="photo-archival object-cover"
          />

          {/* scanning sweep — only while the skyline is being extracted */}
          {!reduced && stage === "skyline" && (
            <div
              key={`sweep-${run}`}
              className="pointer-events-none absolute inset-y-0 left-0 w-[18%] bg-gradient-to-r from-transparent via-evidence-bright/35 to-transparent"
              style={{ animation: "sweep 1.5s var(--ease-archival) forwards" }}
            />
          )}

          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full"
          >
            {/* the curve the Skyline Extractor read off the pixels */}
            <g
              className="transition-transform duration-[900ms] [transition-timing-function:var(--ease-archival)]"
              style={{ transform: matched ? "translate(0,0)" : "translate(0.9px,1.6px)" }}
            >
              <path
                key={`extracted-${run}`}
                d={EXTRACTED_PATH}
                fill="none"
                stroke="#ffe9b8"
                style={{ filter: "drop-shadow(0 1px 2px rgb(6 19 32 / 0.55))" }}
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray="3 2.5"
                vectorEffect="non-scaling-stroke"
                className={cn(
                  "transition-opacity duration-500",
                  showExtracted ? "opacity-100" : "opacity-0",
                )}
              />
            </g>

            {/* the horizon ray-cast from swissALTI3D */}
            <path
              key={`terrain-${run}`}
              d={TRUE_PATH}
              fill="none"
              stroke="var(--evidence-bright)"
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pathLength={1000}
              strokeDasharray={1000}
              className={cn(showTerrain ? "opacity-100" : "opacity-0")}
              style={{
                filter: "drop-shadow(0 0 5px rgb(23 162 222 / 0.7))",
                strokeDashoffset: reduced ? 0 : undefined,
                animation:
                  showTerrain && !reduced
                    ? "draw-horizon 1.5s var(--ease-archival) forwards"
                    : undefined,
                // @ts-expect-error -- consumed by the draw-horizon keyframe
                "--dash": 1000,
              }}
            />
          </svg>

          {/* Summit markers. The marker sits ON the summit and the chip hangs
              below it: a Grosser Mythen at 4.9 % of the frame height leaves no
              room for a label above, and a clipped label is worse than none. */}
          {SUMMITS.map((summit, i) => (
            <div
              key={summit.id}
              className={cn(
                "pointer-events-none absolute flex -translate-x-1/2 flex-col items-center transition-[opacity,transform] duration-500 [transition-timing-function:var(--ease-archival)]",
                matched ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
              )}
              style={{
                left: `${summit.x * 100}%`,
                top: `${summit.y * 100}%`,
                transitionDelay: matched ? `${i * 160}ms` : "0ms",
              }}
            >
              <span className="relative grid size-2 place-items-center">
                <span className="size-2 rounded-full bg-evidence-bright ring-[3px] ring-evidence-bright/25" />
                {!reduced && matched && (
                  <span
                    className="absolute size-2 rounded-full bg-evidence-bright"
                    style={{ animation: "ping-ring 2.4s var(--ease-archival) 2" }}
                  />
                )}
              </span>
              <span
                className={cn(
                  "w-px bg-evidence-bright/70",
                  // stagger the stems so two chips can never collide, at any width
                  i % 2 === 0 ? "h-5 sm:h-7" : "h-3 sm:h-4",
                )}
              />
              <span className="whitespace-nowrap rounded-[5px] border border-evidence-bright/50 bg-[#061320]/85 px-1.5 py-0.5 font-mono text-[0.5625rem] leading-tight text-[#d8f2ff] shadow-sm backdrop-blur-sm sm:text-[0.625rem]">
                {summit.name}{" "}
                <span className="text-evidence-bright">{summit.elevation} m</span>
              </span>
            </div>
          ))}

          {/* plate furniture */}
          <div className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-[5px] border border-white/15 bg-[#061320]/70 px-1.5 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-[#cfe3f2] backdrop-blur-sm">
            <Crosshair className="size-2.5 text-evidence-bright" strokeWidth={2} />
            {t("photoLabel")} · {HERO_PHOTO.signature}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-[#061320]/85 via-[#061320]/25 to-transparent p-2.5 sm:p-3">
            <span className="font-mono text-[0.5625rem] leading-tight text-[#cfe3f2] sm:text-[0.625rem]">
              {CAMERA_POSE.lv95.easting} / {CAMERA_POSE.lv95.northing} LV95
            </span>
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.1em] backdrop-blur-sm transition-colors duration-500 sm:text-[0.625rem]",
                done
                  ? "bg-corroborated/25 text-[#8ff0c4]"
                  : "bg-evidence-bright/20 text-[#cfe9ff]",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  done ? "bg-[#8ff0c4]" : "animate-pulse bg-evidence-bright",
                )}
              />
              {stageLabel}
            </span>
          </div>
        </div>
      </div>

      {/* ── The readout ───────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-[1.35fr_1fr]">
        <div className="rounded-[0.625rem] border border-line bg-surface/80 p-3.5 backdrop-blur-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted">
              {t("correlation")}
            </span>
            <span
              className={cn(
                "font-mono text-lg font-semibold tabular-nums transition-colors duration-500",
                matched ? "text-corroborated" : "text-muted-2",
              )}
            >
              {matched ? CAMERA_POSE.correlation.toFixed(3) : "—.———"}
            </span>
          </div>

          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line-strong/40">
            <div
              className="h-full rounded-full bg-corroborated transition-[width] duration-[1100ms] [transition-timing-function:var(--ease-archival)]"
              style={{ width: matched ? `${CAMERA_POSE.correlation * 100}%` : "0%" }}
            />
          </div>

          <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2.5">
            {[
              { label: t("bearing"), value: `${CAMERA_POSE.bearing}°` },
              { label: t("hfov"), value: `${CAMERA_POSE.hfov}°` },
              { label: t("accuracy"), value: `±${CAMERA_POSE.accuracyMetres} m` },
            ].map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="font-mono text-[0.5rem] uppercase leading-tight tracking-[0.08em] text-muted-2 [overflow-wrap:anywhere] sm:text-[0.5625rem] sm:tracking-[0.1em]">
                  {row.label}
                </dt>
                <dd
                  className={cn(
                    "font-mono text-[0.8125rem] tabular-nums transition-colors duration-500",
                    done ? "text-foreground" : "text-muted-2",
                  )}
                >
                  {done ? row.value : "—"}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* the hypothesis the geometry kills */}
        <div
          className={cn(
            "flex flex-col justify-between gap-2 rounded-[0.625rem] border p-3.5 transition-all duration-700 [transition-timing-function:var(--ease-archival)]",
            done
              ? "border-refuted/35 bg-refuted-soft opacity-100"
              : "border-line bg-surface/50 opacity-45",
          )}
        >
          <div className="flex items-start gap-2">
            <span
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full transition-colors duration-500",
                done ? "bg-refuted text-background" : "bg-line-strong/50",
              )}
            >
              {done && <X className="size-2.5" strokeWidth={3} />}
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-refuted">
                {t("refutedTitle")}
              </p>
              <p className="mt-1 text-[0.75rem] leading-snug text-muted">
                {t("refutedBody")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex items-center gap-2 text-[0.75rem] leading-snug text-muted">
          <Check
            className={cn(
              "size-3.5 shrink-0 transition-colors duration-500",
              done ? "text-corroborated" : "text-muted-2",
            )}
            strokeWidth={2.4}
          />
          <span>
            {t("caption", { metres: CAMERA_POSE.accuracyMetres })}{" "}
            <span className="text-muted-2">{t("geometryNote")}</span>
          </span>
        </p>
        <button
          type="button"
          onClick={replay}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[0.6875rem] text-muted transition-colors duration-200 hover:bg-surface-2 hover:text-foreground"
        >
          <RotateCcw className="size-3" strokeWidth={2} />
          {t("replay")}
          <span className="sr-only"> — {t("replayHint")}</span>
        </button>
      </figcaption>
    </figure>
  );
}
