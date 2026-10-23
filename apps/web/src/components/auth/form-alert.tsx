import { AlertTriangle } from "lucide-react";

/**
 * Submission-level errors. `role="alert"` so the failure is announced rather
 * than only turning something red above the fold.
 */
export function FormAlert({ title, message }: { title: string; message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-refuted/35 bg-refuted-soft px-3.5 py-3"
    >
      <AlertTriangle
        aria-hidden
        className="mt-px size-4 shrink-0 text-refuted"
        strokeWidth={2}
      />
      <div className="min-w-0">
        <p className="text-[0.8125rem] font-medium text-refuted">{title}</p>
        <p className="mt-0.5 text-[0.75rem] leading-snug text-muted">{message}</p>
      </div>
    </div>
  );
}
