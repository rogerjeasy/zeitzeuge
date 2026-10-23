export function AuthHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <h1 className="font-display text-[clamp(1.75rem,1.4rem+1.4vw,2.25rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-balance-tight text-foreground-strong">
        {title}
      </h1>
      <p className="max-w-[42ch] text-[0.875rem] leading-[1.7] text-muted">
        {subtitle}
      </p>
    </div>
  );
}
