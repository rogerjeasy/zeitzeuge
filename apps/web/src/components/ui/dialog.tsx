"use client";

import { useEffect, useId, useRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The app's modal: a native `<dialog>` opened with `showModal()`, so the page
 * behind it is inert and the browser announces it as a dialog. On top of that
 * it keeps Tab inside itself, closes on Esc (unless busy), names itself by its
 * title and description, and hands focus back to whatever opened it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  busy = false,
  initialFocus,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** While true, Esc and the backdrop do nothing: a request is on its way. */
  busy?: boolean;
  /** CSS selector inside the dialog to focus first; else the first focusable. */
  initialFocus?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const busyRef = useRef(busy);
  const closeRef = useRef(onClose);

  useEffect(() => {
    busyRef.current = busy;
    closeRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      const target =
        (initialFocus && dialog.querySelector<HTMLElement>(initialFocus)) ||
        dialog.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialFocus]);

  // Hand focus back on close, wherever the close came from.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onDialogClose = () => {
      const back = opener.current;
      opener.current = null;
      if (back && document.contains(back)) back.focus();
    };
    dialog.addEventListener("close", onDialogClose);
    return () => dialog.removeEventListener("close", onDialogClose);
  }, []);

  function onKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      aria-busy={busy || undefined}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        // Esc: the native dialog would close itself; we decide.
        event.preventDefault();
        if (!busyRef.current) closeRef.current();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> itself.
        if (event.target === ref.current && !busyRef.current) closeRef.current();
      }}
      className={cn(
        "m-auto w-[min(30rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface p-0 text-foreground shadow-lift",
        "backdrop:bg-foreground-strong/45 backdrop:backdrop-blur-[2px]",
        "open:[animation:rise-in_160ms_var(--ease-archival)_both]",
        className,
      )}
    >
      <div className="flex flex-col gap-3 px-5 pb-4 pt-5">
        <h2 id={titleId} className="font-display text-[1.125rem] font-semibold leading-snug tracking-[-0.01em] text-foreground-strong">
          {title}
        </h2>
        {description && (
          <div id={descId} className="flex flex-col gap-2 text-[0.8125rem] leading-relaxed text-muted">
            {description}
          </div>
        )}
        {children}
      </div>
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">
          {footer}
        </div>
      )}
    </dialog>
  );
}

/**
 * A yes/no on top of `Dialog`. Destructive confirmations start on «Abbrechen»,
 * so a stray Enter never withdraws anything.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  tone = "default",
  busy = false,
  confirmDisabled = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "default" | "danger";
  busy?: boolean;
  confirmDisabled?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      busy={busy}
      initialFocus={tone === "danger" ? "[data-dialog-cancel]" : "[data-dialog-confirm]"}
      footer={
        <>
          <button
            type="button"
            data-dialog-cancel
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-10 items-center rounded-lg border border-line-strong bg-surface px-4 text-[0.8125rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-dialog-confirm
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            aria-busy={busy || undefined}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[0.8125rem] font-semibold text-background transition-colors disabled:opacity-60",
              tone === "danger" ? "bg-refuted hover:opacity-90" : "bg-foreground hover:bg-foreground-strong",
            )}
          >
            {busy && <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2} />}
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
