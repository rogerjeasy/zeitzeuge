import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * The brand mark, from the supplied artwork rather than redrawn: three
 * photographic plates dissolving into a data grid.
 *
 * This is the compact crop — the plates and the first column of the dissolve.
 * At the 32 px the header gives it, the artwork's far circuitry is sub-pixel
 * and turns the whole mark to mush; dropping it lets the silhouette read.
 *
 * Two files, not one filtered file — the artwork's plates are near-black navy
 * and would disappear against a dark surface, so the dark variant lifts only
 * those pixels toward slate while leaving the photograph and the circuitry
 * alone. Both are tiny once Next re-encodes them at the rendered size.
 */
export function LogoMark({
  className,
  eager = false,
}: {
  className?: string;
  /** Set in the header: the mark is above the fold on every page. */
  eager?: boolean;
}) {
  return (
    <>
      <Image
        src="/brand/zeitzeuge-mark-compact.png"
        alt=""
        width={256}
        height={209}
        loading={eager ? "eager" : "lazy"}
        className={cn("w-auto dark:hidden", className)}
      />
      <Image
        src="/brand/zeitzeuge-mark-compact-dark.png"
        alt=""
        width={256}
        height={209}
        loading={eager ? "eager" : "lazy"}
        className={cn("hidden w-auto dark:block", className)}
      />
    </>
  );
}

/**
 * Mark plus the ZEITZEUGE wordmark, as one piece of artwork.
 *
 * Both variants are decorative and the name is carried by the element that
 * wraps them. Putting the alt text on one of the two images would leave the
 * link nameless in whichever theme hides that image.
 */
export function LogoLockup({ className }: { className?: string }) {
  return (
    <>
      <Image
        src="/brand/zeitzeuge-lockup.png"
        alt=""
        width={720}
        height={370}
        className={cn("w-auto dark:hidden", className)}
      />
      <Image
        src="/brand/zeitzeuge-lockup-dark.png"
        alt=""
        width={720}
        height={370}
        className={cn("hidden w-auto dark:block", className)}
      />
    </>
  );
}
