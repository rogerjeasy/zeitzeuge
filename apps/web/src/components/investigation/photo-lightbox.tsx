"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus, RotateCcw, X } from "lucide-react";

const MIN = 1;
const MAX = 6;
const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));

/**
 * The photograph full screen (spec §4): Esc or ✕ closes it, the wheel, a
 * pinch or the ± buttons zoom, dragging pans once zoomed, 0 resets. A native
 * modal `<dialog>`, so focus stays inside and the page behind is inert.
 */
export function PhotoLightbox({
  src,
  alt,
  open,
  onClose,
}: {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("investigation.review");
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-lightbox-close]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };
  const zoom = (factor: number) =>
    setScale((s) => {
      const next = clamp(s * factor);
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });

  // React's onWheel is passive; zooming needs preventDefault, so bind it natively.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      setScale((s) => {
        const next = clamp(s * factor);
        if (next === 1) setOffset({ x: 0, y: 0 });
        return next;
      });
    };
    dialog.addEventListener("wheel", onWheel, { passive: false });
    return () => dialog.removeEventListener("wheel", onWheel);
  }, [open]);

  function onPointerDown(event: React.PointerEvent) {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setDragging(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale };
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      setScale(clamp((pinch.current.scale * distance) / Math.max(pinch.current.distance, 1)));
    } else if (pointers.current.size === 1 && scale > 1) {
      setOffset((o) => ({ x: o.x + event.clientX - previous.x, y: o.y + event.clientY - previous.y }));
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setDragging(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "+" || event.key === "=") zoom(1.25);
    else if (event.key === "-") zoom(0.8);
    else if (event.key === "0") reset();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={() => {
        reset();
        const back = opener.current;
        if (back && document.contains(back)) back.focus();
      }}
      onKeyDown={onKeyDown}
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-ink-panel p-0 text-ink-panel-fg backdrop:bg-ink-panel/90"
    >
      <h2 id={titleId} className="sr-only">
        {alt}
      </h2>
      <div
        className="absolute inset-0 grid touch-none select-none place-items-center overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => (scale > 1 ? reset() : zoom(2))}
        style={{ cursor: scale > 1 ? "grab" : "zoom-in" }}
      >
        {/* A presigned S3 URL that expires: not for the image optimiser. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full object-contain"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: dragging ? "none" : "transform 120ms ease-out",
          }}
        />
      </div>
      <div className="absolute inset-x-0 top-0 flex items-center justify-end gap-1.5 p-3">
        <p aria-live="polite" className="mr-auto rounded-md bg-ink-panel/70 px-2 py-1 font-mono text-[0.75rem] tabular-nums text-ink-panel-body">
          {Math.round(scale * 100)} %
        </p>
        <LightboxButton label={t("zoomOut")} onClick={() => zoom(0.8)} disabled={scale <= MIN}>
          <Minus aria-hidden className="size-4" strokeWidth={2} />
        </LightboxButton>
        <LightboxButton label={t("zoomIn")} onClick={() => zoom(1.25)} disabled={scale >= MAX}>
          <Plus aria-hidden className="size-4" strokeWidth={2} />
        </LightboxButton>
        <LightboxButton label={t("zoomReset")} onClick={reset} disabled={scale === 1}>
          <RotateCcw aria-hidden className="size-4" strokeWidth={2} />
        </LightboxButton>
        <LightboxButton label={t("closePhoto")} onClick={onClose} data-lightbox-close>
          <X aria-hidden className="size-4.5" strokeWidth={2} />
        </LightboxButton>
      </div>
      <p className="absolute inset-x-0 bottom-0 p-3 text-center text-[0.6875rem] text-ink-panel-muted">
        {t("lightboxHint")}
      </p>
    </dialog>
  );
}

function LightboxButton({
  label,
  children,
  ...rest
}: { label: string; children: React.ReactNode } & React.ComponentPropsWithoutRef<"button"> & {
    "data-lightbox-close"?: boolean;
  }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid size-10 place-items-center rounded-lg border border-ink-panel-line bg-ink-panel/80 text-ink-panel-fg transition-colors hover:bg-ink-panel-line disabled:opacity-40"
      {...rest}
    >
      {children}
    </button>
  );
}
