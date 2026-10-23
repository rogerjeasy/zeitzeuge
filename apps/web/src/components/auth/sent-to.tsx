import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";

/** The address a message just went to, shown as its own scannable row rather
 *  than inlined mid-sentence — easier to check for a typo. */
export function SentTo({ email }: { email: string }) {
  const t = useTranslations("auth.common");

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5">
      <Mail aria-hidden className="size-4 shrink-0 text-muted-2" strokeWidth={1.9} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
          {t("sentTo")}
        </span>
        <span className="truncate text-[0.8125rem] font-medium text-foreground">
          {email}
        </span>
      </span>
    </div>
  );
}
