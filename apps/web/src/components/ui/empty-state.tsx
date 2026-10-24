import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * The one empty state of the signed-in app: an icon, a one-line title, one
 * line on what will appear here, and the next step when there is one.
 *
 * Used both for "nothing yet" (the archive has no batch) and for "not yet
 * available" (a screen whose data source does not exist yet) — `tag` names
 * the second case on its face, so neither reads as broken.
 *
 * No hooks, so it renders in server and client components alike; callers pass
 * translated strings.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  tag,
  action,
  secondary,
  size = "panel",
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  /** A small label above the title, e.g. «Noch nicht verfügbar». */
  tag?: string;
  action?: { href: string; label: string };
  secondary?: { href: string; label: string };
  /** `panel` sits inside a page; `inline` is the compact form for a card. */
  size?: "panel" | "inline";
  className?: string;
  /** A client-side next step (a button), rendered with the actions. */
  children?: React.ReactNode;
}) {
  const inline = size === "inline";
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center text-center",
        inline
          ? "gap-2 px-4 py-6 sm:px-5"
          : "gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface-2/40 px-5 py-12 sm:px-8 sm:py-14",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid place-items-center rounded-xl border border-line bg-surface text-muted-2",
          inline ? "size-9" : "size-12",
        )}
      >
        <Icon className={inline ? "size-4" : "size-5"} strokeWidth={1.8} />
      </span>

      <div className="flex min-w-0 flex-col items-center gap-1">
        {tag && (
          <p className="font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-muted">{tag}</p>
        )}
        <p
          className={cn(
            "font-medium text-foreground-strong [overflow-wrap:anywhere]",
            inline ? "text-[0.875rem]" : "font-display text-[1.0625rem] tracking-[-0.01em]",
          )}
        >
          {title}
        </p>
        <p className="max-w-[56ch] text-[0.8125rem] leading-relaxed text-muted [overflow-wrap:anywhere]">
          {body}
        </p>
      </div>

      {(action || secondary || children) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action && (
            <Link
              href={action.href}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-[0.8125rem] font-medium text-background transition-colors hover:bg-foreground-strong"
            >
              {action.label}
              <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
            </Link>
          )}
          {secondary && (
            <Link
              href={secondary.href}
              className="inline-flex h-10 items-center rounded-lg border border-line-strong bg-surface px-4 text-[0.8125rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence"
            >
              {secondary.label}
            </Link>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

/** A page whose content has no data source yet: header, then the empty state. */
export function UnavailablePage({
  heading,
  subtitle,
  ...state
}: { heading: string; subtitle?: string } & Parameters<typeof EmptyState>[0]) {
  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex min-w-0 flex-col gap-1.5">
        <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
          {heading}
        </h1>
        {subtitle && <p className="max-w-[72ch] text-[0.875rem] text-muted">{subtitle}</p>}
      </header>
      <EmptyState {...state} />
    </div>
  );
}
