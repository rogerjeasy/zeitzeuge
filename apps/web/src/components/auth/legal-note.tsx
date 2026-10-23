import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";

export function LegalNote() {
  const t = useTranslations("auth.common");

  return (
    <p className="text-[0.6875rem] leading-relaxed text-muted-2">
      {t("legalPrefix")}{" "}
      <Link href="/terms" className="underline decoration-line-strong underline-offset-2 transition-colors hover:text-foreground">
        {t("terms")}
      </Link>{" "}
      {t("legalAnd")}{" "}
      <Link href="/privacy" className="underline decoration-line-strong underline-offset-2 transition-colors hover:text-foreground">
        {t("privacy")}
      </Link>
      .
    </p>
  );
}

/** The data-residency line. Small, but it is the sentence Kantons-IT looks for. */
export function ResidencyNote() {
  const t = useTranslations("auth.common");

  return (
    <p className="flex items-center gap-1.5 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-2">
      <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-corroborated" strokeWidth={2} />
      {t("residency")}
    </p>
  );
}
