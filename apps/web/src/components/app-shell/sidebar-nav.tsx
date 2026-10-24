"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { NavItem } from "@/lib/data/nav";
import { NAV_ICON } from "./nav-icons";
import { cn } from "@/lib/cn";

/**
 * One nav renderer for the sidebar and the mobile drawer. `collapsed` only
 * changes presentation — the same markup and the same accessible names, so a
 * screen reader hears the label whether or not it is painted.
 */
export function SidebarNav({
  items,
  label,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  label: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("app.nav");
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="flex flex-col gap-0.5">
      {!collapsed && (
        <p className="px-3 pb-1.5 pt-2 font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-muted-2">
          {label}
        </p>
      )}

      {items.map((item) => {
        const Icon = NAV_ICON[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.id}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={collapsed ? t(item.id) : undefined}
            className={cn(
              "group relative flex items-center rounded-lg text-[0.8125rem] font-medium transition-colors duration-150",
              collapsed ? "h-10 w-10 justify-center" : "h-9 gap-2.5 px-3",
              active
                ? "bg-surface-2 text-foreground-strong"
                : "text-muted hover:bg-surface-2/70 hover:text-foreground",
            )}
          >
            {/* the active marker, drawn rather than coloured-in */}
            <span
              aria-hidden
              className={cn(
                "absolute left-0 top-1/2 w-0.5 -translate-y-1/2 rounded-r-full bg-evidence transition-all duration-200",
                active ? "h-5 opacity-100" : "h-0 opacity-0",
              )}
            />
            <Icon
              aria-hidden
              className={cn("size-4 shrink-0", active ? "text-evidence" : "text-muted-2")}
              strokeWidth={1.9}
            />

            {!collapsed && <span className="truncate">{t(item.id)}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
