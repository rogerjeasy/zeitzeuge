"use client";

import { AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/cn";

/** A titled card. Every settings section is built from these. */
export function SettingCard({
  title,
  description,
  children,
  tone = "default",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border bg-surface",
        tone === "danger" ? "border-refuted/35" : "border-line",
      )}
    >
      <header className="flex flex-col gap-1 border-b border-line px-4 py-3.5 sm:px-5">
        <h2
          className={cn(
            "font-display text-[0.9375rem] font-semibold tracking-[-0.01em]",
            tone === "danger" ? "text-refuted" : "text-foreground-strong",
          )}
        >
          {title}
        </h2>
        {description && (
          <p className="max-w-[72ch] text-[0.75rem] leading-snug text-muted">
            {description}
          </p>
        )}
      </header>
      <div className="flex flex-col divide-y divide-line">{children}</div>
    </section>
  );
}

/**
 * One setting: label and explanation on the left, control on the right. The
 * explanation is not optional decoration — a setting nobody understands is a
 * setting nobody touches.
 */
export function SettingRow({
  label,
  hint,
  htmlFor,
  control,
  children,
  stack,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  /** Rendered on the right on wide screens. */
  control?: React.ReactNode;
  /** Rendered full width underneath — for sliders, radio groups, lists. */
  children?: React.ReactNode;
  stack?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div
        className={cn(
          "flex gap-4",
          stack ? "flex-col" : "flex-col sm:flex-row sm:items-start sm:justify-between",
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
          {htmlFor ? (
            <label htmlFor={htmlFor} className="text-[0.8125rem] font-medium text-foreground">
              {label}
            </label>
          ) : (
            <p className="text-[0.8125rem] font-medium text-foreground">{label}</p>
          )}
          {hint && (
            <p className="max-w-[62ch] text-[0.75rem] leading-relaxed text-muted">{hint}</p>
          )}
        </div>
        {control && <div className="shrink-0 sm:pt-0.5">{control}</div>}
      </div>
      {children}
    </div>
  );
}

/** A read-only fact. Used where something is architecture, not configuration. */
export function SettingFact({
  label,
  value,
  locked = true,
}: {
  label: string;
  value: string;
  locked?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
      <span className="text-[0.8125rem] text-muted">{label}</span>
      <span className="flex items-center gap-1.5 font-mono text-[0.75rem] text-foreground">
        {locked && (
          <Check aria-hidden className="size-3.5 shrink-0 text-corroborated" strokeWidth={2.5} />
        )}
        {value}
      </span>
    </div>
  );
}

export function InlineWarning({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-review/35 bg-review-soft px-3 py-2 text-[0.75rem] leading-snug text-review">
      <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={2} />
      {children}
    </p>
  );
}

/** For the surfaces that are designed but not yet connected. */
export function NotConnectedNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 border-b border-line bg-surface-2/60 px-4 py-2.5 text-[0.75rem] leading-snug text-muted sm:px-5">
      <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0 text-muted-2" strokeWidth={2} />
      {children}
    </p>
  );
}
