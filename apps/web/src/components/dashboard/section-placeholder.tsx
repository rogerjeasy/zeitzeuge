import { useTranslations } from "next-intl";
import { HardHat } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

/**
 * Stands in for the screens that are not built yet, inside the real shell, so
 * every nav destination leads somewhere and says honestly what it is.
 */
export function SectionPlaceholder({ navKey }: { navKey: string }) {
  const t = useTranslations("section");
  const tNav = useTranslations("app.nav");

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-5 py-12">
      <div className="flex max-w-[34rem] flex-col items-center gap-5 text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-review-soft text-review">
          <HardHat aria-hidden className="size-5" strokeWidth={1.9} />
        </span>

        <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
          {t("soonTitle", { screen: tNav(navKey) })}
        </h1>

        <p className="max-w-[46ch] text-[0.875rem] leading-[1.7] text-muted">
          {t("soonBody")}
        </p>

        <Button as={Link} href="/dashboard" variant="secondary">
          {t("soonBack")}
        </Button>

        <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-2">
          {t("soonNote")}
        </p>
      </div>
    </div>
  );
}
