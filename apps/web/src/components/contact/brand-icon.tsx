import { BRANDS } from "@/lib/data/brands";
import { cn } from "@/lib/cn";

/**
 * A brand mark in its own colour.
 *
 * Two paths rather than one filtered path: a brand whose official colour is
 * black needs its published white variant on a dark surface, and `currentColor`
 * with a CSS filter would produce neither of the two colours the brand actually
 * licenses. The mark is decorative — the link around it carries the name.
 */
export function BrandIcon({ brand, className }: { brand: string; className?: string }) {
  const mark = BRANDS[brand];
  if (!mark) return null;

  return (
    <>
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className={cn("shrink-0", mark.darkHex && "dark:hidden", className)}
        fill={mark.hex}
      >
        <path d={mark.path} />
      </svg>

      {mark.darkHex && (
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={cn("hidden shrink-0 dark:block", className)}
          fill={mark.darkHex}
        >
          <path d={mark.path} />
        </svg>
      )}
    </>
  );
}
