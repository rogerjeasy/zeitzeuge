import { useLocale, useTranslations } from "next-intl";
import { RANKED_FIELD_KEYS, type QcMeasured } from "@/lib/api/investigation-types";
import { cn } from "@/lib/cn";
import { intlLocale } from "./labels";

/**
 * How often the machine was right, measured against the archive's own reviews
 * (identification-upgrade note §6). Each reviewed field counts once, by its first
 * review: accepted = right, corrected or rejected = wrong, filled in = missed.
 * Shown per field and per confidence band, so «≥ 0.90» can be checked against
 * the brief's 90 % line. Labelled as team-reviewed, not an independent gold set.
 */
export function MeasuredPanel({ measured }: { measured: QcMeasured }) {
  const t = useTranslations("evaluation.measured");
  const tf = useTranslations("investigation.fields");
  const intl = intlLocale(useLocale());
  const pct = (v: number | null) =>
    v === null ? "—" : new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 0 }).format(v);
  const num = (v: number) => new Intl.NumberFormat(intl, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(v);
  const bins = [...measured.bins].reverse().filter((b) => b.fields > 0);

  return (
    <section
      aria-labelledby="measured-heading"
      className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="measured-heading" className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong">
          {t("title")}
        </h2>
        <p className="max-w-[78ch] text-[0.75rem] leading-relaxed text-muted">{t("hint", { count: measured.judged })}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[26rem] border-collapse text-[0.75rem]">
            <caption className="pb-2 text-left font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">
              {t("byField")}
            </caption>
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th scope="col" className="py-1.5 pr-2 font-medium">{t("field")}</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">{t("judged")}</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">{t("correct")}</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">{t("wrong")}</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">{t("missed")}</th>
                <th scope="col" className="py-1.5 text-right font-medium">{t("precision")}</th>
              </tr>
            </thead>
            <tbody>
              {RANKED_FIELD_KEYS.map((key) => {
                const row = measured.fields[key];
                if (!row) return null;
                return (
                  <tr key={key} className="border-b border-line/60">
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal text-foreground">{tf(key)}</th>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{row.judged}</td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-corroborated">{row.correct}</td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-refuted">{row.wrong}</td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-muted">{row.missed}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-foreground-strong">{pct(row.precision)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[20rem] border-collapse text-[0.75rem]">
            <caption className="pb-2 text-left font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">
              {t("byBand")}
            </caption>
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th scope="col" className="py-1.5 pr-2 font-medium">{t("band")}</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">{t("fields")}</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">{t("correct")}</th>
                <th scope="col" className="py-1.5 text-right font-medium">{t("accuracy")}</th>
              </tr>
            </thead>
            <tbody>
              {bins.map((bin) => (
                <tr key={bin.low} className={cn("border-b border-line/60", bin.low >= 0.9 && "bg-corroborated/5")}>
                  <th scope="row" className="py-1.5 pr-2 text-left font-mono font-normal tabular-nums text-foreground">
                    {num(bin.low)}–{num(bin.high)}
                  </th>
                  <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{bin.fields}</td>
                  <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{bin.correct}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-foreground-strong">{pct(bin.accuracy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pt-2 text-[0.6875rem] text-muted-2">{t("bandHint")}</p>
        </div>
      </div>
    </section>
  );
}
