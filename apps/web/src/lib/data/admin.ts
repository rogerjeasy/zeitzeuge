import { RUN_MODES } from "./settings";

/**
 * Administration (§9.2 #11): model routing, thresholds, guardrail policy, cost
 * caps.
 *
 * Four settings that each carry a consequence the operator should see before
 * they commit it, so every control here is paired with the number it moves. The
 * cascade is the one worth playing with: it is the answer to "does this scale
 * to 100'000 images", and that answer changes when you drag a threshold.
 */

/* ── §5.4 M1 — the confidence-gated cascade ─────────────────────────────── */

/**
 * First-pass confidence on the gold set, as a histogram in 0.05 bins.
 *
 * Shares are computed by integrating these rather than stored per threshold,
 * so the projection moves continuously and the defaults reproduce the measured
 * 60 / 30 / 10 split in §5.4 rather than restating it.
 */
export const HAIKU_CONFIDENCE: { from: number; share: number }[] = [
  { from: 0.50, share: 0.06 }, { from: 0.55, share: 0.05 },
  { from: 0.60, share: 0.05 }, { from: 0.65, share: 0.05 },
  { from: 0.70, share: 0.05 }, { from: 0.75, share: 0.07 },
  { from: 0.80, share: 0.07 }, { from: 0.85, share: 0.13 },
  { from: 0.90, share: 0.20 }, { from: 0.95, share: 0.27 },
];

/** Second-pass confidence, over only what the first pass let through. */
export const SONNET_CONFIDENCE: { from: number; share: number }[] = [
  { from: 0.50, share: 0.03 }, { from: 0.55, share: 0.03 },
  { from: 0.60, share: 0.04 }, { from: 0.65, share: 0.05 },
  { from: 0.70, share: 0.05 }, { from: 0.75, share: 0.05 },
  { from: 0.80, share: 0.15 }, { from: 0.85, share: 0.20 },
  { from: 0.90, share: 0.22 }, { from: 0.95, share: 0.18 },
];

/** Share of a distribution at or above `threshold`, interpolated inside a bin. */
function tailAbove(bins: { from: number; share: number }[], threshold: number) {
  return bins.reduce((sum, bin) => {
    const to = bin.from + 0.05;
    if (threshold <= bin.from) return sum + bin.share;
    if (threshold >= to) return sum;
    // the threshold cuts this bin: take the part of it above the cut
    return sum + bin.share * ((to - threshold) / 0.05);
  }, 0);
}

export interface CascadeProjection {
  fast: number;
  standard: number;
  deep: number;
  /** Blended USD per image across the three stages. */
  costPerImage: number;
  /** What running the deep pipeline on everything would cost, per image. */
  flatCostPerImage: number;
}

const cost = (id: string) => RUN_MODES.find((m) => m.id === id)!.costUsd;

export function projectCascade(emitAtFast: number, emitAtStandard: number): CascadeProjection {
  const fast = tailAbove(HAIKU_CONFIDENCE, emitAtFast);
  const standard = (1 - fast) * tailAbove(SONNET_CONFIDENCE, emitAtStandard);
  const deep = 1 - fast - standard;

  return {
    fast, standard, deep,
    // An escalated image was paid for at every stage it passed through, which
    // is why this is a sum of cumulative costs and not a weighted average.
    costPerImage:
      fast * cost("fast") +
      standard * (cost("fast") + cost("standard")) +
      deep * (cost("fast") + cost("standard") + cost("deep")),
    flatCostPerImage: cost("fast") + cost("standard") + cost("deep"),
  };
}

/* ── the model bindings the router resolves (§10.4) ─────────────────────── */

export interface Binding {
  /** key under `admin.routing.stages.*` */
  id: string;
  model: string;
  /** Where inference runs — the residency answer (§10.3). */
  region: string;
  /** What the router falls back to if the primary is unavailable. */
  fallback: string;
}

export const BINDINGS: Binding[] = [
  { id: "fast", model: "Claude Haiku 4.5", region: "eu-central-2 · Zürich", fallback: "Claude Haiku 4.5 · eu-central-1" },
  { id: "standard", model: "Claude Sonnet 5", region: "EU cross-region profile", fallback: "Claude Sonnet 5 · eu-west-1" },
  { id: "deep", model: "Claude Opus 5", region: "EU cross-region profile", fallback: "Claude Sonnet 5" },
  { id: "adversarial", model: "Amazon Nova Pro", region: "EU cross-region profile", fallback: "Claude Haiku 4.5" },
];

/* ── §5.2 #16 — the sensitivity gate ────────────────────────────────────── */

export type GuardrailAction = "hold" | "flag" | "allow";

export interface GuardrailPolicy {
  /** key under `admin.guardrails.policies.*` */
  id: string;
  action: GuardrailAction;
  /** Policies the product refuses to let an operator weaken. */
  locked?: boolean;
}

export const GUARDRAIL_POLICIES: GuardrailPolicy[] = [
  { id: "minors", action: "hold", locked: true },
  { id: "livingPersons", action: "hold" },
  { id: "pii", action: "hold" },
  { id: "sensitiveContent", action: "flag" },
  { id: "faceRecognition", action: "hold", locked: true },
];

export const GUARDRAIL_ACTIONS: GuardrailAction[] = ["hold", "flag", "allow"];

/* ── §13 — cost caps ────────────────────────────────────────────────────── */

export const BUDGET = {
  /** The hackathon credit (§12). */
  totalUsd: 2000,
  spentUsd: 214,
  /** CloudWatch billing alarms, as fractions of the credit. */
  alarms: [0.25, 0.5, 0.75],
};

export const ADMIN_DEFAULTS = {
  /** §5.4 M1 — emit from the first pass at or above this. */
  emitAtFast: 0.85,
  /** …and from the second pass at or above this. */
  emitAtStandard: 0.8,
  /** §9.2 #7 — above this a record enters the catalogue unreviewed. */
  autoAccept: 0.92,
  /** P3 — abstention is a feature, switchable off only with a warning. */
  allowAbstention: true,
  /** The gate refuses to open by default (§5.2 #16). */
  failClosed: true,
  /** Hard ceiling per run, in USD. */
  perRunCapUsd: 1.5,
  /** Daily spend ceiling, in USD. */
  dailyCapUsd: 120,
  /** Alarm at this share of the credit. */
  alarmAt: 0.75,
};
