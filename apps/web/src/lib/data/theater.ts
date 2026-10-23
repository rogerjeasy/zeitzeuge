import { AGENTS } from "./agents";

/**
 * The Agent Theater (§9.2 #5) — one run, replayable.
 *
 * The architecture is the product's argument, and an architecture nobody can
 * see is a claim nobody can check. So this is the run as it happened: when each
 * of the eighteen agents held the floor, what it put into the evidence ledger,
 * and the two moments that matter — the falsifier killing two hypotheses with
 * geometry, and the red team, on a different model family, objecting to the one
 * that survived.
 *
 * Timings and cost reconcile with the q1 case file: 94 s, 18 agents, USD 0.21.
 */

export interface AgentWindow {
  /** agent id, keyed to AGENTS */
  id: string;
  /** seconds into the run */
  start: number;
  duration: number;
  costUsd: number;
}

/** When each agent held the floor. Tiers overlap; agents inside a tier run
 *  in parallel, which is the whole reason a run is 94 s and not 18 × 20 s. */
export const WINDOWS: AgentWindow[] = [
  { id: "forensics", start: 0, duration: 4, costUsd: 0 },

  { id: "skyline", start: 4, duration: 11, costUsd: 0.004 },
  { id: "materiality", start: 4, duration: 13, costUsd: 0.008 },
  { id: "scene", start: 4, duration: 16, costUsd: 0.011 },
  { id: "text-in-image", start: 5, duration: 15, costUsd: 0.009 },
  { id: "heritage", start: 5, duration: 19, costUsd: 0.012 },
  { id: "verso", start: 6, duration: 21, costUsd: 0.013 },

  { id: "geo", start: 26, duration: 20, costUsd: 0.021 },
  { id: "memory", start: 27, duration: 12, costUsd: 0.003 },
  { id: "chronology", start: 30, duration: 24, costUsd: 0.038 },

  { id: "synthesiser", start: 55, duration: 9, costUsd: 0.031 },
  { id: "falsifier", start: 58, duration: 12, costUsd: 0.001 },
  { id: "redteam", start: 66, duration: 10, costUsd: 0.002 },
  { id: "adjudicator", start: 72, duration: 11, costUsd: 0.044 },

  { id: "cartographer", start: 84, duration: 5, costUsd: 0.002 },
  { id: "multilingual", start: 84, duration: 4, costUsd: 0.002 },
  { id: "sensitivity", start: 85, duration: 5, costUsd: 0.003 },
  { id: "curator", start: 89, duration: 5, costUsd: 0.002 },
];

export const RUN_SECONDS = Math.max(...WINDOWS.map((w) => w.start + w.duration));
export const RUN_COST = Number(WINDOWS.reduce((n, w) => n + w.costUsd, 0).toFixed(2));

export type EventKind = "note" | "evidence" | "objection" | "abstain" | "verdict";

export interface TheaterEvent {
  id: string;
  /** seconds into the run */
  t: number;
  agent: string;
  kind: EventKind;
  /** key under `theater.events.<key>` */
  key: string;
  /** The ledger row it wrote, where it wrote one. */
  evidenceId?: string;
  /** Posteriors after this event. Every set sums to 1. */
  posteriors?: Record<string, number>;
  /** Hypotheses this event refutes outright. */
  kills?: string[];
}

export const PRIORS: Record<string, number> = {
  hyp_A: 0.42, hyp_B: 0.31, hyp_C: 0.19, hyp_D: 0.08,
};

/**
 * What reached the ledger, in order.
 *
 * The posterior column is the run's spine: it starts at the priors, moves when
 * evidence lands, collapses twice when the falsifier re-renders the horizon,
 * and — the part worth pausing on — falls back when the red team objects.
 * A system whose confidence only ever rises is not reasoning.
 */
export const EVENTS: TheaterEvent[] = [
  { id: "e01", t: 4, agent: "forensics", kind: "note", key: "plateIndexed" },
  { id: "e02", t: 15, agent: "skyline", kind: "note", key: "horizonSegmented" },
  {
    id: "e03", t: 17, agent: "materiality", kind: "evidence", key: "photochrom",
    evidenceId: "ev_014",
    posteriors: { hyp_A: 0.46, hyp_B: 0.29, hyp_C: 0.18, hyp_D: 0.07 },
  },
  {
    id: "e04", t: 20, agent: "scene", kind: "evidence", key: "twinPeak",
    evidenceId: "ev_001",
    posteriors: { hyp_A: 0.61, hyp_B: 0.22, hyp_C: 0.14, hyp_D: 0.03 },
  },
  {
    id: "e05", t: 20, agent: "text-in-image", kind: "evidence", key: "printCaption",
    evidenceId: "ev_012",
    posteriors: { hyp_A: 0.78, hyp_B: 0.12, hyp_C: 0.07, hyp_D: 0.03 },
  },
  { id: "e06", t: 24, agent: "heritage", kind: "note", key: "noBuiltMatch" },
  { id: "e07", t: 27, agent: "verso", kind: "note", key: "versoRead" },
  { id: "e08", t: 39, agent: "memory", kind: "note", key: "nearestNeighbours" },
  { id: "e09", t: 46, agent: "geo", kind: "note", key: "candidatePositions" },
  {
    id: "e10", t: 54, agent: "chronology", kind: "evidence", key: "quaiMap",
    evidenceId: "ev_011",
    posteriors: { hyp_A: 0.84, hyp_B: 0.10, hyp_C: 0.05, hyp_D: 0.01 },
  },
  { id: "e11", t: 64, agent: "synthesiser", kind: "note", key: "fourHypotheses" },
  {
    // The moment the architecture earns itself: geometry, not language,
    // removing two of the four candidates.
    id: "e12", t: 70, agent: "falsifier", kind: "evidence", key: "horizonMatch",
    evidenceId: "ev_007",
    kills: ["hyp_B", "hyp_C"],
    posteriors: { hyp_A: 0.96, hyp_B: 0.02, hyp_C: 0.01, hyp_D: 0.01 },
  },
  {
    // And the moment it proves it is not just agreeing with itself: a
    // different model family, objecting to the surviving answer.
    id: "e13", t: 76, agent: "redteam", kind: "objection", key: "quaiObjection",
    evidenceId: "ev_018",
    posteriors: { hyp_A: 0.89, hyp_B: 0.02, hyp_C: 0.02, hyp_D: 0.07 },
  },
  {
    id: "e14", t: 81, agent: "adjudicator", kind: "verdict", key: "adjudicated",
    posteriors: { hyp_A: 0.94, hyp_B: 0.02, hyp_C: 0.03, hyp_D: 0.01 },
  },
  { id: "e15", t: 83, agent: "adjudicator", kind: "abstain", key: "photographerAbstain" },
  { id: "e16", t: 88, agent: "cartographer", kind: "note", key: "isadWritten" },
  { id: "e17", t: 88, agent: "multilingual", kind: "note", key: "translated" },
  { id: "e18", t: 90, agent: "sensitivity", kind: "note", key: "noFlags" },
  { id: "e19", t: 94, agent: "curator", kind: "note", key: "evalCases" },
];

/* ── reading the run at a point in time ─────────────────────────────────── */

export type AgentState = "pending" | "running" | "done";

export function agentStateAt(id: string, t: number): AgentState {
  const w = WINDOWS.find((x) => x.id === id);
  if (!w) return "pending";
  if (t < w.start) return "pending";
  return t >= w.start + w.duration ? "done" : "running";
}

/** Events already emitted, newest first — the feed reads downward from now. */
export function eventsAt(t: number) {
  return EVENTS.filter((e) => e.t <= t).reverse();
}

export function posteriorsAt(t: number) {
  const last = [...EVENTS].reverse().find((e) => e.t <= t && e.posteriors);
  return last?.posteriors ?? PRIORS;
}

/** Hypotheses geometry has removed by time `t`. */
export function killedAt(t: number) {
  return new Set(EVENTS.filter((e) => e.t <= t).flatMap((e) => e.kills ?? []));
}

export function costAt(t: number) {
  return WINDOWS.reduce((n, w) => {
    if (t <= w.start) return n;
    // charge proportionally while an agent is mid-flight, so the meter moves
    const share = Math.min((t - w.start) / w.duration, 1);
    return n + w.costUsd * share;
  }, 0);
}

export function doneCountAt(t: number) {
  return WINDOWS.filter((w) => t >= w.start + w.duration).length;
}

export const AGENT_IDS = new Set(AGENTS.map((a) => a.id));

/** Every window must name a real agent, and every agent must get a window. */
export const SCHEDULE_COMPLETE =
  WINDOWS.length === AGENTS.length && WINDOWS.every((w) => AGENT_IDS.has(w.id));

/** The run this screen replays. */
export const RUN = {
  id: "run_01JBQ7",
  recordId: "q1",
  signature: "StASZ Ansichtskarten/0042",
  mode: "standard",
};
