"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Mail, Send } from "lucide-react";
import { Select } from "@/components/ui/select";
import { CONTACT_EMAIL } from "@/lib/data/about";
import { TOPICS, type Topic } from "@/lib/data/contact";
import { cn } from "@/lib/cn";

interface Values {
  name: string;
  email: string;
  topic: Topic;
  message: string;
}

const EMPTY: Values = { name: "", email: "", topic: "archive", message: "" };

/** Deliberately permissive: the point is to catch a typo, not to adjudicate RFC 5322. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * The contact form.
 *
 * There is no mail server behind this prototype, so the form does not pretend
 * there is. It validates properly and then hands the finished message to the
 * reader's own mail client with everything filled in — which actually sends,
 * where a green "thanks, we'll be in touch" toast over a discarded payload
 * would simply be a lie. The button and the note under it both say so before
 * you press it.
 */
export function ContactForm() {
  const t = useTranslations("contact.form");
  const [values, setValues] = useState<Values>(EMPTY);
  const [touched, setTouched] = useState(false);
  const nameId = useId();
  const emailId = useId();
  const messageId = useId();

  const errors = {
    name: values.name.trim().length < 2,
    email: !EMAIL.test(values.email.trim()),
    message: values.message.trim().length < 20,
  };
  const invalid = errors.name || errors.email || errors.message;

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (invalid) return;

    const subject = `[${t(`topics.${values.topic}`)}] ${t("mailSubject")}`;
    const body = [
      `${t("nameLabel")}: ${values.name.trim()}`,
      `${t("emailLabel")}: ${values.email.trim()}`,
      `${t("topicLabel")}: ${t(`topics.${values.topic}`)}`,
      "",
      values.message.trim(),
    ].join("\n");

    window.location.href =
      `mailto:${CONTACT_EMAIL}` +
      `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={nameId}
          label={t("nameLabel")}
          error={touched && errors.name ? t("nameError") : undefined}
        >
          <input
            id={nameId}
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            autoComplete="name"
            aria-invalid={touched && errors.name}
            className={inputClass(touched && errors.name)}
          />
        </Field>

        <Field
          id={emailId}
          label={t("emailLabel")}
          error={touched && errors.email ? t("emailError") : undefined}
        >
          <input
            id={emailId}
            type="email"
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
            autoComplete="email"
            aria-invalid={touched && errors.email}
            className={inputClass(touched && errors.email)}
          />
        </Field>
      </div>

      <Select
        label={t("topicLabel")}
        value={values.topic}
        onChange={(e) => set("topic", e.target.value as Topic)}
        options={TOPICS.map((topic) => ({ value: topic, label: t(`topics.${topic}`) }))}
      />

      <Field
        id={messageId}
        label={t("messageLabel")}
        hint={t("messageHint")}
        error={touched && errors.message ? t("messageError") : undefined}
      >
        <textarea
          id={messageId}
          rows={6}
          value={values.message}
          onChange={(e) => set("message", e.target.value)}
          aria-invalid={touched && errors.message}
          className={cn(inputClass(touched && errors.message), "min-h-[9rem] resize-y py-2.5")}
        />
      </Field>

      <div className="flex flex-col gap-2.5">
        <button
          type="submit"
          className="inline-flex h-11 w-fit items-center gap-2 rounded-xl bg-foreground px-5 text-sm font-medium text-background transition-colors duration-200 hover:bg-foreground-strong"
        >
          <Send aria-hidden className="size-4" strokeWidth={2} />
          {t("submit")}
        </button>

        <p className="flex items-start gap-2 text-[0.75rem] leading-relaxed text-muted-2">
          <Mail aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={2} />
          {t("mailtoNote")}
        </p>
      </div>
    </form>
  );
}

function inputClass(invalid: boolean) {
  return cn(
    "h-11 w-full rounded-lg border bg-background px-3 text-[0.875rem] text-foreground-strong outline-none transition-colors",
    "placeholder:text-muted-2 focus-visible:border-evidence",
    invalid ? "border-refuted" : "border-line-strong",
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-foreground">
        {label}
      </label>
      {hint && <p className="text-[0.75rem] leading-snug text-muted">{hint}</p>}
      {children}
      {/* aria-live so a validation message is announced, not just drawn */}
      <p aria-live="polite" className="min-h-[1rem]">
        {error && (
          <span className="flex items-center gap-1.5 text-[0.75rem] text-refuted">
            <AlertCircle aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
            {error}
          </span>
        )}
      </p>
    </div>
  );
}
