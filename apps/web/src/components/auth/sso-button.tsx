import { useId } from "react";
import { useTranslations } from "next-intl";
import { Building2 } from "lucide-react";

/**
 * Cantonal SAML sign-in.
 *
 * Rendered but explicitly disabled, and labelled as such on the face of the
 * button. It is here because federated sign-in is the first question a cantonal
 * IT department asks — but a control that looks live and does nothing would be
 * exactly the kind of unevidenced claim this product argues against, so it is
 * `disabled`, `aria-disabled`, and carries its own explanation.
 */
export function SsoButton() {
  const t = useTranslations("auth.common");
  const hintId = useId();

  return (
    <div className="flex flex-col">
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-describedby={hintId}
        className="flex h-11 w-full cursor-not-allowed items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-2/40 px-3.5 text-left"
      >
        <Building2
          aria-hidden
          className="size-4 shrink-0 text-muted-2"
          strokeWidth={1.9}
        />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[0.8125rem] font-medium text-muted">
            {t("ssoCta")}
          </span>
          <span className="truncate font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
            {t("ssoNote")}
          </span>
        </span>
      </button>

      {/* The button face already carries the short form; this is the full
          explanation for anyone who cannot see it. */}
      <p id={hintId} className="sr-only">
        {t("ssoDisabledHint")}
      </p>
    </div>
  );
}
