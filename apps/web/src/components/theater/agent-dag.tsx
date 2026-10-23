"use client";

import { useTranslations } from "next-intl";
import { AGENTS, FAMILY_STYLES, TIERS } from "@/lib/data/agents";
import { WINDOWS, agentStateAt } from "@/lib/data/theater";
import { cn } from "@/lib/cn";

/**
 * The pipeline, lit as it runs.
 *
 * Laid out by tier because the tiers are the argument: six agents in Tier 1
 * hold the floor at the same time, which is why eighteen agents finish in
 * ninety-four seconds. A node carries its model family as a colour, so "six
 * families, one router" is visible before it is read.
 *
 * The red team is the one node allowed to break the palette. It is a different
 * model family on purpose (§5.2 #13), and when it objects it should be the
 * thing your eye goes to.
 */
export function AgentDag({ t, activeAgents }: { t: number; activeAgents: string[] }) {
  const tr = useTranslations("theater");
  const tAgents = useTranslations("orchestra.agents");
  const tTiers = useTranslations("orchestra.tiers");
  const tFamilies = useTranslations("orchestra.families");

  return (
    <section
      aria-labelledby="dag-heading"
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="dag-heading"
          className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong"
        >
          {tr("graphTitle")}
        </h2>
        <p className="text-[0.75rem] leading-relaxed text-muted">{tr("graphHint")}</p>
      </div>

      <ol className="flex flex-col gap-3">
        {TIERS.map(({ tier, id }, tierIndex) => {
          const agents = AGENTS.filter((a) => a.tier === tier);
          const anyRunning = agents.some((a) => agentStateAt(a.id, t) === "running");

          return (
            <li key={id} className="relative flex flex-col gap-1.5">
              {tierIndex > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute -top-3 left-4 h-3 w-px transition-colors duration-300",
                    anyRunning ? "bg-evidence" : "bg-line-strong",
                  )}
                />
              )}

              <div className="flex items-center gap-2.5">
                <p
                  className={cn(
                    "font-mono text-[0.5625rem] uppercase tracking-[0.12em] transition-colors duration-300",
                    anyRunning ? "text-evidence" : "text-muted-2",
                  )}
                >
                  {tTiers(id)}
                </p>
                <span aria-hidden className="h-px flex-1 rule-archival" />
              </div>

              <ul className="flex flex-wrap gap-1.5">
                {agents.map((agent) => {
                  const state = agentStateAt(agent.id, t);
                  const emitting = activeAgents.includes(agent.id);
                  const window = WINDOWS.find((w) => w.id === agent.id)!;
                  const style = FAMILY_STYLES[agent.family];
                  const isRedTeam = agent.id === "redteam";

                  return (
                    <li key={agent.id}>
                      <span
                        title={`${tAgents(`${agent.id}.name`)} — ${tr(`states.${state}`)}`}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-all duration-300",
                          "[transition-timing-function:var(--ease-archival)]",
                          state === "pending" && "border-line bg-surface-2/30 opacity-45",
                          state === "running" &&
                            (isRedTeam
                              ? "border-refuted bg-refuted-soft"
                              : "border-evidence bg-evidence-soft"),
                          state === "done" && "border-line-strong bg-surface-2/60",
                          emitting && !isRedTeam && "ring-2 ring-evidence/40",
                          emitting && isRedTeam && "ring-2 ring-refuted/50",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "size-1.5 shrink-0 rounded-full transition-opacity",
                            style.dot,
                            state === "running" &&
                              "[animation:pulse-node_1.1s_ease-in-out_infinite]",
                          )}
                        />
                        <span
                          className={cn(
                            "text-[0.6875rem] leading-none transition-colors",
                            state === "pending" ? "text-muted-2" : "text-foreground",
                          )}
                        >
                          {tAgents(`${agent.id}.name`)}
                        </span>

                        {/* a hairline progress bar under a running node, so the
                            reader can see it is working rather than stuck */}
                        {state === "running" && (
                          <span
                            aria-hidden
                            className="ml-0.5 h-0.5 w-5 overflow-hidden rounded-full bg-line-strong/40"
                          >
                            <span
                              className={cn(
                                "block h-full rounded-full",
                                isRedTeam ? "bg-refuted" : "bg-evidence",
                              )}
                              style={{
                                width: `${Math.min(
                                  ((t - window.start) / window.duration) * 100,
                                  100,
                                )}%`,
                              }}
                            />
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>

      <ul className="flex flex-wrap gap-x-3 gap-y-1.5 border-t border-line pt-3">
        {Object.entries(FAMILY_STYLES).map(([family, style]) => (
          <li key={family} className="flex items-center gap-1.5 text-[0.625rem] text-muted-2">
            <span aria-hidden className={cn("size-2 rounded-full", style.dot)} />
            {style.labelKey ? tFamilies(style.labelKey) : style.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
