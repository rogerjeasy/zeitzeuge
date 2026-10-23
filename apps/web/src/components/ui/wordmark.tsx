import { cn } from "@/lib/cn";
import { LogoMark } from "./logo";

/**
 * The header lockup: the artwork mark beside live type. The wordmark stays as
 * text rather than pixels so it inherits the theme, stays crisp at any density,
 * and is selectable and readable by a screen reader.
 */
export function Wordmark({
  className,
  eager = false,
  compact = false,
}: {
  className?: string;
  eager?: boolean;
  /** Hide the wordmark text below `sm`, leaving just the mark. Used where the
   *  bar also has to hold the locale and theme controls on a phone. */
  compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark eager={eager} className="h-7 shrink-0 sm:h-8" />
      <span
        className={cn(
          "font-display text-[0.9375rem] font-semibold uppercase leading-none tracking-[0.15em] text-foreground-strong sm:text-[1.0625rem]",
          compact && "hidden sm:inline",
        )}
      >
        Zeitzeuge
      </span>
    </span>
  );
}
