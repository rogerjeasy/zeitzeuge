"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type ToastInput = {
  message: string;
  tone?: "success" | "error" | "info";
  /** e.g. «Rückgängig». Clicking it runs the action and dismisses the toast. */
  action?: { label: string; onClick: () => void };
  /** Default 8 s; an undo needs time to be read and reached by keyboard. */
  durationMs?: number;
};

type Toast = ToastInput & { id: number };

/**
 * Toasts for one screen. `push` returns the id; `dismiss` takes it.
 * The region is rendered by `<ToastRegion>`, always mounted, so screen
 * readers hear each new toast through its live region.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((toast: ToastInput) => {
    const id = next.current++;
    // At most three at once; the oldest goes first.
    setToasts((list) => [...list.slice(-2), { ...toast, id }]);
    return id;
  }, []);

  return { toasts, push, dismiss };
}

export function ToastRegion({
  toasts,
  dismiss,
  label,
  closeLabel,
}: {
  toasts: Toast[];
  dismiss: (id: number) => void;
  /** The landmark's name, e.g. «Meldungen». */
  label: string;
  closeLabel: string;
}) {
  return (
    <section
      aria-label={label}
      className="pointer-events-none fixed inset-x-4 top-[4.5rem] z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end"
    >
      <div role="status" aria-live="polite" aria-atomic="false" className="flex w-full flex-col items-center gap-2 sm:items-end">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} closeLabel={closeLabel} />
        ))}
      </div>
    </section>
  );
}

function ToastItem({
  toast,
  onDismiss,
  closeLabel,
}: {
  toast: Toast;
  onDismiss: () => void;
  closeLabel: string;
}) {
  const [paused, setPaused] = useState(false);
  const duration = toast.durationMs ?? 8000;
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => dismissRef.current(), duration);
    return () => clearTimeout(timer);
  }, [paused, duration]);

  const Icon = toast.tone === "error" ? AlertTriangle : CheckCircle2;
  return (
    <div
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "pointer-events-auto flex w-full max-w-[26rem] items-start gap-2.5 rounded-xl border bg-surface px-3.5 py-3 shadow-lift",
        "[animation:rise-in_160ms_var(--ease-archival)_both]",
        toast.tone === "error" ? "border-refuted/40" : "border-line-strong",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-px size-4 shrink-0",
          toast.tone === "error" ? "text-refuted" : toast.tone === "info" ? "text-evidence" : "text-corroborated",
        )}
        strokeWidth={2}
      />
      <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-foreground [overflow-wrap:anywhere]">
        {toast.message}
      </p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
          className="-my-1 inline-flex h-8 shrink-0 items-center rounded-lg border border-evidence/50 px-2.5 text-[0.75rem] font-semibold text-evidence transition-colors hover:bg-evidence-soft"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={closeLabel}
        className="-my-1 -mr-1.5 grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <X aria-hidden className="size-4" strokeWidth={2} />
      </button>
    </div>
  );
}
