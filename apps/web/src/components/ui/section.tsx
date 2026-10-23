import { cn } from "@/lib/cn";

/**
 * Page section wrapper. Owns the single horizontal gutter for the whole page so
 * no inner component can accidentally let content touch the screen edge on a
 * phone.
 */
export function Section({
  id,
  children,
  className,
  containerClassName,
  tone = "base",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  tone?: "base" | "raised" | "inverted";
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative w-full scroll-mt-20",
        tone === "raised" && "bg-surface-2/60",
        tone === "inverted" && "bg-ink-panel text-ink-panel-fg",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto w-full max-w-[84rem] px-5 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-32",
          containerClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  align = "left",
  className,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-5",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      {eyebrow}
      <div
        className={cn(
          "flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-12",
          align === "center" && "lg:flex-col lg:items-center",
        )}
      >
        <h2
          className={cn(
            "max-w-[19ch] font-display text-[clamp(2rem,1.35rem+2.6vw,3.35rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-balance-tight text-foreground-strong",
            align === "center" && "max-w-[22ch]",
          )}
        >
          {title}
        </h2>
        {body && (
          <p
            className={cn(
              "max-w-[52ch] text-[0.9375rem] leading-[1.7] text-muted sm:text-base",
              align === "center" && "max-w-[58ch]",
            )}
          >
            {body}
          </p>
        )}
      </div>
      {actions}
    </div>
  );
}
