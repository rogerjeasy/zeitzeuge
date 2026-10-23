import type { Unit } from "@/lib/data/evaluation";

/**
 * One formatter for the whole screen.
 *
 * A metric's unit decides its precision, so the target and the measured value
 * are always printed the same way — otherwise a row can show "0.05" against
 * "0.049" and look like a miss when the verdict says it passed.
 */
export function formatValue(value: number, unit: Unit, intl: string) {
  const nf = (min: number, max: number) =>
    new Intl.NumberFormat(intl, { minimumFractionDigits: min, maximumFractionDigits: max });

  switch (unit) {
    case "percent":
      return `${nf(1, 1).format(value)} %`;
    case "years":
      return nf(1, 1).format(value);
    case "metres":
      return `${nf(0, 0).format(value)} m`;
    case "usd":
      return new Intl.NumberFormat(intl, {
        style: "currency", currency: "USD",
        minimumFractionDigits: 3, maximumFractionDigits: 3,
      }).format(value);
    case "seconds":
      return `${nf(0, 0).format(value)} s`;
    case "ratio":
      return nf(3, 3).format(value);
  }
}
