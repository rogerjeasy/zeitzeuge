export function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" role="presentation">
      <span aria-hidden className="h-px flex-1 bg-line" />
      <span className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted-2">
        {label}
      </span>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}
