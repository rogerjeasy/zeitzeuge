import { cn } from "@/lib/cn";

/** The small uppercase label above a section title. Its rule is drawn, not
 *  bordered, so it reads like an archival heading rather than a chip. */
export function Eyebrow({
  children,
  className,
  rule = true,
}: {
  children: React.ReactNode;
  className?: string;
  rule?: boolean;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-3 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-muted",
        className,
      )}
    >
      {rule && (
        <span aria-hidden className="h-px w-6 shrink-0 bg-evidence sm:w-8" />
      )}
      {children}
    </p>
  );
}
