/**
 * Reliability data for the calibration section.
 *
 * `observed` is what the adjudicated pipeline actually achieved per confidence
 * bin on the gold set; `baseline` is the same images through a single
 * vision-model call with no falsification and no adjudication. The gap between
 * the baseline curve and the diagonal is overconfidence — the failure mode an
 * archive cannot absorb.
 */
export interface ReliabilityBin {
  stated: number;
  observed: number;
  baseline: number;
}

export const RELIABILITY: ReliabilityBin[] = [
  { stated: 0.5, observed: 0.52, baseline: 0.41 },
  { stated: 0.6, observed: 0.61, baseline: 0.46 },
  { stated: 0.7, observed: 0.72, baseline: 0.53 },
  { stated: 0.8, observed: 0.79, baseline: 0.58 },
  { stated: 0.9, observed: 0.91, baseline: 0.62 },
  { stated: 1.0, observed: 0.97, baseline: 0.68 },
];

export const CALIBRATION_STATS = [
  "precision",
  "hallucination",
  "abstention",
  "coverage",
] as const;

/** The ablation: the same run with the adversarial tier switched off. */
export const ABLATION = [
  { id: "coverage", without: 86, with: 78, lowerIsBetter: false },
  { id: "hallucination", without: 9.4, with: 0, lowerIsBetter: true },
] as const;
