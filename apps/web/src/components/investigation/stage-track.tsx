"use client";

import { useTranslations } from "next-intl";
import { FINISHED_RUN_STATUSES, STAGES } from "@/lib/api/investigation-types";
import { cn } from "@/lib/cn";

/**
 * Where one photograph's run is: nine segments for the eight investigation
 * stages and `produce`. Done segments are filled, the current one pulses, and
 * a failed run stops red at the stage that failed.
 */
export function StageTrack({
  stage,
  runStatus,
  className,
}: {
  stage: string | null;
  runStatus: string | null;
  className?: string;
}) {
  const t = useTranslations("investigation");
  const finished = runStatus !== null && FINISHED_RUN_STATUSES.has(runStatus);
  const failed = runStatus === "failed";
  const index = stage ? STAGES.indexOf(stage as (typeof STAGES)[number]) : -1;
  const current = finished ? STAGES.length : Math.max(index, runStatus === "running" ? 0 : -1);

  const label = !runStatus
    ? t("runStatus.none")
    : finished
      ? t("runStatus.finished")
      : failed
        ? t("stageFailedAt", { stage: stage ? stageName(t, stage) : "—" })
        : runStatus === "queued"
          ? t("runStatus.queued")
          : t("stageAt", {
              n: Math.max(index, 0) + 1,
              total: STAGES.length,
              stage: stage ? stageName(t, stage) : "—",
            });

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span aria-hidden className="flex gap-[3px]">
        {STAGES.map((name, i) => (
          <span
            key={name}
            title={stageName(t, name)}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i < current && "bg-corroborated",
              i === current && !finished && !failed && runStatus === "running" && "animate-pulse bg-evidence",
              i === current && failed && "bg-refuted",
              (i > current || (i === current && runStatus !== "running" && !failed)) &&
                "bg-line-strong/50",
            )}
          />
        ))}
      </span>
      <span
        className={cn(
          "truncate font-mono text-[0.625rem] tabular-nums",
          failed ? "text-refuted" : finished ? "text-corroborated" : "text-muted",
        )}
      >
        {label}
      </span>
    </div>
  );
}

function stageName(t: ReturnType<typeof useTranslations>, stage: string): string {
  return (STAGES as readonly string[]).includes(stage) ? t(`stages.${stage}`) : stage;
}
