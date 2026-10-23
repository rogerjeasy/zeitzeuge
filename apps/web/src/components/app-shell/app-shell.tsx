"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Wordmark } from "@/components/ui/wordmark";
import { LogoMark } from "@/components/ui/logo";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/lib/data/nav";
import {
  getSidebarCollapsed,
  getSidebarServerSnapshot,
  setSidebarCollapsed,
  subscribeSidebar,
} from "@/lib/sidebar-store";
import { SidebarNav } from "./sidebar-nav";
import { AppHeader } from "./app-header";
import { cn } from "@/lib/cn";

/**
 * The application chrome: a collapsible sidebar on desktop, an off-canvas
 * drawer below `lg`, and a sticky header. Owns both pieces of layout state so
 * the header's toggle and the sidebar stay in step.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("app.nav");
  const collapsed = useSyncExternalStore(
    subscribeSidebar,
    getSidebarCollapsed,
    getSidebarServerSnapshot,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  function toggleSidebar() {
    setSidebarCollapsed(!collapsed);
  }

  // The drawer owns the viewport while it is open.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-dvh bg-background">
      {/* ── desktop sidebar ─────────────────────────────────────────────── */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface-2/40 lg:flex",
          "transition-[width] duration-300 [transition-timing-function:var(--ease-archival)]",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-line",
            collapsed ? "justify-center px-2" : "px-4",
          )}
        >
          <Link href="/dashboard" aria-label="ZEITZEUGE">
            {collapsed ? <LogoMark eager className="h-7" /> : <Wordmark eager />}
          </Link>
        </div>

        <div className={cn("flex flex-1 flex-col gap-4 overflow-y-auto py-3", collapsed ? "px-3" : "px-3")}>
          <SidebarNav items={PRIMARY_NAV} label={t("primaryLabel")} collapsed={collapsed} />
          <div className="mt-auto flex flex-col gap-4">
            <SidebarNav items={SECONDARY_NAV} label={t("secondaryLabel")} collapsed={collapsed} />
          </div>
        </div>
      </aside>

      {/* ── mobile drawer ───────────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground-strong/35 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("primaryLabel")}
            className="absolute inset-y-0 left-0 flex w-[17rem] flex-col border-r border-line bg-surface [animation:slide-in-left_220ms_var(--ease-archival)_both]"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <Link href="/dashboard" aria-label="ZEITZEUGE" onClick={() => setDrawerOpen(false)}>
                <Wordmark eager />
              </Link>
              <button
                type="button"
                autoFocus
                onClick={() => setDrawerOpen(false)}
                title={t("closeMenu")}
                className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <X aria-hidden className="size-4.5" strokeWidth={1.9} />
                <span className="sr-only">{t("closeMenu")}</span>
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-3">
              <SidebarNav
                items={PRIMARY_NAV}
                label={t("primaryLabel")}
                collapsed={false}
                onNavigate={() => setDrawerOpen(false)}
              />
              <div className="mt-auto flex flex-col gap-4">
                <SidebarNav
                  items={SECONDARY_NAV}
                  label={t("secondaryLabel")}
                  collapsed={false}
                  onNavigate={() => setDrawerOpen(false)}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── content column ──────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          collapsed={collapsed}
          onToggleSidebar={toggleSidebar}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
        <main id="main" className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
