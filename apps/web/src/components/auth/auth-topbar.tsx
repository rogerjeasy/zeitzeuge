import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Wordmark } from "@/components/ui/wordmark";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * The auth pages carry their own top bar rather than the site header: the whole
 * point of this screen is one decision, and a full nav invites the visitor to
 * leave it.
 */
export function AuthTopbar() {
  return (
    <div className="flex items-center justify-between gap-4">
      <Link href="/" aria-label="ZEITZEUGE" className="shrink-0">
        <Wordmark eager compact />
      </Link>
      <div className="flex items-center gap-2">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
    </div>
  );
}

export function BackHomeLink() {
  const t = useTranslations("auth.common");

  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 text-[0.75rem] text-muted transition-colors duration-200 hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-3.5" strokeWidth={2} />
      {t("back")}
    </Link>
  );
}
