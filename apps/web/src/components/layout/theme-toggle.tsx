"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

const OPTIONS = [
  { value: "light", Icon: Sun, key: "themeLight" },
  { value: "dark", Icon: Moon, key: "themeDark" },
  { value: "system", Icon: Monitor, key: "themeSystem" },
] as const;

/**
 * A three-state segmented control rather than a two-state switch: "system" is a
 * real preference and hiding it forces a choice the visitor didn't make.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const { theme, setTheme } = useTheme();
  // The stored theme is unknown during SSR, so no segment may render as active
  // until after hydration — otherwise the markup mismatches.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <div
      role="group"
      aria-label={t("theme")}
      className={cn(
        "flex items-center gap-0.5 rounded-full border border-line bg-surface/60 p-0.5 backdrop-blur-sm",
        className,
      )}
    >
      {OPTIONS.map(({ value, Icon, key }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={active}
            title={t(key)}
            className={cn(
              "grid size-7 place-items-center rounded-full transition-colors duration-200",
              active
                ? "bg-foreground text-background"
                : "text-muted hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" strokeWidth={1.9} />
            <span className="sr-only">{t(key)}</span>
          </button>
        );
      })}
    </div>
  );
}
