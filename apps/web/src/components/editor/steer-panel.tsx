"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Play, RefreshCw, ShieldCheck } from "lucide-react";
import {
  FULL_RUN_SECONDS,
  RERUN_SECONDS,
  STEER_CHAINS,
  classifySteer,
} from "@/lib/data/editor";
import { cn } from "@/lib/cn";

type Phase = "idle" | "running" | "done";

/**
 * §5.4 M3 — steer and partially re-execute.
 *
 * The point this panel has to make before the button is ever pressed: a hint
 * does not throw the investigation away. The invalidation set is shown while
 * you type, so the archivist can see that correcting the place costs six nodes
 * and keeps nine — which is the difference between a system you can correct
 * and one you can only re-run.
 */
export function SteerPanel({ onApplied }: { onApplied: () => void }) {
  const t = useTranslations("editor.steer");
  const tAgents = useTranslations("orchestra.agents");

  const [hint, setHint] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const trimmed = hint.trim();
  const chain = trimmed ? classifySteer(trimmed) : null;
  const plan = chain ? STEER_CHAINS[chain] : null;

  function run() {
    if (!plan || phase === "running") return;
    setPhase("running");
    timers.current.push(
      setTimeout(() => {
        setPhase("done");
        onApplied();
      }, 1400),
    );
  }

  return (
    <section
      aria-label={t("title")}
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 [animation:rise-in_180ms_var(--ease-archival)_both]"
    >
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 font-display text-[1rem] text-foreground-strong">
          <RefreshCw aria-hidden className="size-4 text-evidence" strokeWidth={1.9} />
          {t("title")}
        </h2>
        <p className="max-w-[80ch] text-[0.8125rem] leading-relaxed text-muted">{t("hint")}</p>
      </div>

      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="sr-only">{t("title")}</span>
          <textarea
            value={hint}
            rows={2}
            onChange={(event) => {
              setHint(event.target.value);
              if (phase === "done") setPhase("idle");
            }}
            placeholder={t("placeholder")}
            className="min-h-[4.5rem] w-full resize-y rounded-lg border border-line bg-background px-3 py-2 text-[0.875rem] leading-relaxed text-foreground-strong outline-none transition-colors placeholder:text-muted-2 focus-visible:border-evidence"
          />
        </label>

        <div className="flex shrink-0 flex-col gap-1.5 lg:w-[13.5rem]">
          <button
            type="button"
            onClick={run}
            disabled={!plan || phase === "running"}
            aria-busy={phase === "running"}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-[0.8125rem] font-medium text-background transition-colors hover:bg-foreground-strong disabled:pointer-events-none disabled:opacity-45"
          >
            {phase === "running" ? (
              <>
                <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />
                {t("running")}
              </>
            ) : phase === "done" ? (
              <>
                <Check aria-hidden className="size-3.5" strokeWidth={2.4} />
                {t("done")}
              </>
            ) : (
              <>
                <Play aria-hidden className="size-3.5" strokeWidth={2.2} />
                {t("start")}
              </>
            )}
          </button>

          <p className="text-center font-mono text-[0.625rem] tabular-nums text-muted-2">
            {plan
              ? t("estimate", { seconds: RERUN_SECONDS, full: FULL_RUN_SECONDS })
              : t("empty")}
          </p>
        </div>
      </div>

      {plan && chain && (
        <div className="flex flex-col gap-2.5 border-t border-line pt-3">
          <p className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-evidence">
            {t(`chains.${chain}`)}
          </p>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <ChainList
              title={t("affected")}
              tone="affected"
              agents={plan.affected}
              label={(id) => tAgents(`${id}.name`)}
              running={phase === "running"}
            />
            <ChainList
              title={t("kept")}
              tone="kept"
              agents={plan.kept}
              label={(id) => tAgents(`${id}.name`)}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function ChainList({
  title,
  tone,
  agents,
  label,
  running,
}: {
  title: string;
  tone: "affected" | "kept";
  agents: string[];
  label: (id: string) => string;
  running?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p
        className={cn(
          "flex items-center gap-1.5 font-mono text-[0.5625rem] uppercase tracking-[0.1em]",
          tone === "affected" ? "text-review" : "text-corroborated",
        )}
      >
        {tone === "kept" && <ShieldCheck aria-hidden className="size-3" strokeWidth={2} />}
        {title} · {agents.length}
      </p>
      <ul className="flex flex-wrap gap-1">
        {agents.map((id, i) => (
          <li
            key={id}
            style={running ? { animationDelay: `${i * 60}ms` } : undefined}
            className={cn(
              "rounded-[5px] border px-1.5 py-0.5 text-[0.6875rem] leading-snug",
              tone === "affected"
                ? "border-review/35 bg-review-soft text-review"
                : "border-line bg-surface-2/60 text-muted",
              running && tone === "affected" && "[animation:pulse-node_900ms_ease-in-out_infinite]",
            )}
          >
            {label(id)}
          </li>
        ))}
      </ul>
    </div>
  );
}
