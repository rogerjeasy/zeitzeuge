"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Field } from "@/components/ui/field";

/** Password input with a reveal toggle. The toggle is a real button and says
 *  which state it will switch to, so it is usable without sight of the icon. */
export function PasswordField({
  label,
  error,
  hint,
  action,
  ...input
}: {
  label: string;
  error?: string;
  hint?: string;
  action?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<"input">, "type" | "className">) {
  const t = useTranslations("auth.common");
  const [visible, setVisible] = useState(false);

  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      action={action}
      type={visible ? "text" : "password"}
      {...input}
    >
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        title={visible ? t("hidePassword") : t("showPassword")}
        className="absolute right-1 top-1 grid size-9 place-items-center rounded-lg text-muted-2 transition-colors duration-200 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-evidence/25"
      >
        {visible ? (
          <EyeOff aria-hidden className="size-4" strokeWidth={1.9} />
        ) : (
          <Eye aria-hidden className="size-4" strokeWidth={1.9} />
        )}
        <span className="sr-only">
          {visible ? t("hidePassword") : t("showPassword")}
        </span>
      </button>
    </Field>
  );
}
