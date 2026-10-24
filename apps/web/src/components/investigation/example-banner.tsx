import { useTranslations } from "next-intl";
import { ArrowRight, FlaskConical } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * The honesty label for a screen (or panel) built on example data. Shown on
 * its face, not in a footnote: simulated is fine, pretending to be connected
 * is not.
 */
export function ExampleBanner({
  message,
  href,
  cta,
  className,
}: {
  message?: string;
  href?: string;
  cta?: string;
  className?: string;
}) {
  const t = useTranslations("investigation.example");
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-line-strong bg-surface-2/50 px-3.5 py-2.5",
        className,
      )}
    >
      <FlaskConical aria-hidden className="size-4 shrink-0 text-muted-2" strokeWidth={1.9} />
      <p className="min-w-0 flex-1 text-[0.75rem] leading-snug text-muted">
        <span className="mr-1.5 font-mono text-[0.625rem] font-medium uppercase tracking-[0.1em] text-foreground">
          {t("label")}
        </span>
        {message ?? t("default")}
      </p>
      {href && (
        <Link
          href={href}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 text-[0.75rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence"
        >
          {cta ?? t("toReal")}
          <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
        </Link>
      )}
    </div>
  );
}
