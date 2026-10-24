import { useTranslations } from "next-intl";
import { ArrowRight, ImageOff } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { OpenQuestion } from "@/lib/api/investigation-types";

const FIELD_KEYS = ["locality", "municipality", "building", "landscape_feature", "street"] as const;

/**
 * Photos the system could not fully place. Each card says what is still open and
 * what the machine did establish, and leads to the review screen, where a
 * reviewer's answer becomes `human` evidence like any correction.
 */
export function OpenQuestions({ questions, canAnswer }: { questions: OpenQuestion[]; canAnswer: boolean }) {
  const t = useTranslations("assist");
  const tf = useTranslations("investigation.fields");
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {questions.map((q) => (
        <li key={q.asset_id} className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          <div className="relative aspect-[4/3] bg-background">
            {q.preview_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not a static asset
              <img src={q.preview_url} alt={t("photoAlt", { photo: q.photo })} loading="lazy" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-muted-2">
                <ImageOff aria-hidden className="size-6" strokeWidth={1.5} />
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3.5">
            <p className="truncate font-mono text-[0.75rem] text-foreground-strong">{q.photo}</p>
            <div className="flex flex-col gap-1">
              <p className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">{t("open")}</p>
              <ul className="flex flex-wrap gap-1.5">
                {q.open_fields.map((key) => (
                  <li key={key} className="rounded-full border border-review/40 bg-review-soft px-2 py-0.5 text-[0.6875rem] text-review">
                    {tf(key)}
                  </li>
                ))}
              </ul>
            </div>
            {Object.keys(q.known).length > 0 && (
              <dl className="flex flex-col gap-0.5 text-[0.75rem]">
                <dt className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">{t("known")}</dt>
                {FIELD_KEYS.filter((key) => q.known[key]).map((key) => (
                  <dd key={key} className="truncate text-muted">
                    <span className="text-foreground">{tf(key)}:</span> {q.known[key]}
                  </dd>
                ))}
              </dl>
            )}
            <Link
              href={`/records/${q.asset_id}`}
              className="mt-auto inline-flex items-center gap-1 self-start text-[0.75rem] font-medium text-evidence hover:underline"
            >
              {canAnswer ? t("answer") : t("view")}
              <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
