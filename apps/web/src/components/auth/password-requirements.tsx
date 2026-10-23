"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { PASSWORD_RULES, evaluatePassword, strengthOf } from "@/lib/auth/password";
import { cn } from "@/lib/cn";

const RULE_LABEL: Record<string, string> = {
  length: "ruleLength",
  upper: "ruleUpper",
  lower: "ruleLower",
  digit: "ruleDigit",
  symbol: "ruleSymbol",
};

const TONE = {
  weak: { bar: "bg-refuted", text: "text-refuted" },
  fair: { bar: "bg-review", text: "text-review" },
  good: { bar: "bg-evidence", text: "text-evidence" },
  strong: { bar: "bg-corroborated", text: "text-corroborated" },
} as const;

/**
 * The policy, shown as it is met rather than as an error after the fact. The
 * checklist is driven by the same `PASSWORD_RULES` that gate submission, so the
 * two cannot disagree.
 */
export function PasswordRequirements({ value }: { value: string }) {
  const t = useTranslations("auth.password");
  const { passed, score } = evaluatePassword(value);
  const strength = strengthOf(score);
  const tone = TONE[strength];
  const segments = 5;

  return (
    <div className="flex flex-col gap-2.5" aria-live="polite">
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex flex-1 gap-1">
          {Array.from({ length: segments }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                value && i < score ? tone.bar : "bg-line-strong/35",
              )}
            />
          ))}
        </span>
        <span
          className={cn(
            "w-[6.5rem] shrink-0 text-right font-mono text-[0.625rem] uppercase tracking-[0.08em] transition-colors duration-300",
            value ? tone.text : "text-muted-2",
          )}
        >
          {value ? t(strength) : t("strengthLabel")}
        </span>
      </div>

      <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {PASSWORD_RULES.map((rule) => {
          const ok = passed.includes(rule.id);
          return (
            <li
              key={rule.id}
              className={cn(
                "flex items-center gap-1.5 text-[0.6875rem] transition-colors duration-200",
                ok ? "text-corroborated" : "text-muted-2",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-3 shrink-0 place-items-center rounded-full transition-colors duration-200",
                  ok ? "bg-corroborated text-background" : "border border-line-strong",
                )}
              >
                {ok && <Check className="size-2" strokeWidth={4} />}
              </span>
              {t(RULE_LABEL[rule.id])}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
