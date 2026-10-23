"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { UploadCloud, Loader2, FileArchive } from "lucide-react";
import { cn } from "@/lib/cn";

const subscribeNothing = () => () => {};
const readShortcut = () =>
  /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘ + V" : "Ctrl + V";

/**
 * Intake. Accepts a drop, the file picker, and a paste — an archivist sent one
 * photograph in an email should not have to save it first.
 *
 * Drag state is counted rather than toggled: dragenter/dragleave fire for every
 * child element, so a boolean flickers as the pointer crosses the icon.
 */
export function Dropzone({
  onFiles,
  busy,
  compact,
}: {
  onFiles: (files: File[]) => void;
  busy: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("upload");
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  // The platform is not knowable on the server; read it as a snapshot rather
  // than writing it into state after mount.
  const shortcut = useSyncExternalStore(subscribeNothing, readShortcut, () => "Ctrl + V");

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) {
        event.preventDefault();
        onFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFiles]);

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        depth.current -= 1;
        if (depth.current <= 0) setOver(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed text-center transition-colors duration-200",
        compact ? "px-4 py-6" : "px-6 py-12 sm:py-16",
        over
          ? "border-evidence bg-evidence-soft"
          : "border-line-strong bg-surface-2/40 hover:border-muted-2",
      )}
    >
      <span
        className={cn(
          "grid place-items-center rounded-xl transition-colors duration-200",
          compact ? "size-10" : "size-14",
          over ? "bg-evidence text-background" : "bg-surface text-muted-2",
        )}
      >
        {busy ? (
          <Loader2 aria-hidden className={cn("animate-spin", compact ? "size-5" : "size-6")} strokeWidth={1.9} />
        ) : (
          <UploadCloud aria-hidden className={cn(compact ? "size-5" : "size-6")} strokeWidth={1.7} />
        )}
      </span>

      <div className="flex flex-col gap-1">
        <p className={cn("font-medium text-foreground-strong", compact ? "text-[0.875rem]" : "font-display text-[1.0625rem]")}>
          {busy ? t("reading") : over ? t("dropActive") : t("dropTitle")}
        </p>
        {!compact && (
          <p className="flex flex-wrap items-center justify-center gap-1.5 text-[0.75rem] text-muted">
            <FileArchive aria-hidden className="size-3.5 text-muted-2" strokeWidth={1.9} />
            {t("dropHint", { shortcut })}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="h-9 rounded-lg border border-line-strong bg-surface px-3.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence"
      >
        {t("dropBrowse")}
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        aria-label={t("dropBrowse")}
        accept="image/jpeg,image/png,image/tiff,image/webp,image/avif,.jpg,.jpeg,.png,.tif,.tiff,.webp,.avif,.zip"
        className="sr-only"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
