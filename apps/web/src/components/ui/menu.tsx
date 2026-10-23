"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * A small popover menu. Closes on outside pointer-down and on Escape, restores
 * focus to its trigger, and marks the trigger with the aria the pattern needs.
 * Deliberately not a full roving-tabindex menu: the contents are ordinary links
 * and buttons, so native Tab order is the right behaviour here.
 */
export function Menu({
  trigger,
  children,
  align = "end",
  label,
  panelClassName,
}: {
  trigger: (props: {
    open: boolean;
    toggle: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": "menu";
    "aria-controls": string;
  }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
  label: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      rootRef.current?.querySelector<HTMLElement>("[data-menu-trigger]")?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {trigger({
        open,
        toggle: () => setOpen((v) => !v),
        "aria-expanded": open,
        "aria-haspopup": "menu",
        "aria-controls": panelId,
      })}

      {open && (
        <div
          id={panelId}
          role="menu"
          aria-label={label}
          className={cn(
            "absolute top-[calc(100%+0.5rem)] z-50 min-w-[14rem] overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-lift",
            "[animation:rise-in_140ms_var(--ease-archival)_both]",
            align === "end" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  className,
  ...rest
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
} & React.ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] text-foreground transition-colors duration-150",
        "hover:bg-surface-2 focus:outline-none focus-visible:bg-surface-2",
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1.5 h-px bg-line" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pb-1 pt-1.5 font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">
      {children}
    </p>
  );
}
