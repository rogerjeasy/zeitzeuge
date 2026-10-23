"use client";

import { useTranslations } from "next-intl";
import { Menu as MenuIcon, PanelLeftClose, PanelLeft } from "lucide-react";
import { ArchiveSwitcher } from "./archive-switcher";
import { CommandPalette } from "./command-palette";
import { NotificationsMenu } from "./notifications-menu";
import { UserMenu } from "./user-menu";

export function AppHeader({
  collapsed,
  onToggleSidebar,
  onOpenDrawer,
}: {
  collapsed: boolean;
  onToggleSidebar: () => void;
  onOpenDrawer: () => void;
}) {
  const t = useTranslations("app.nav");

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-background/85 px-3 backdrop-blur-xl sm:px-4">
      {/* drawer on a phone, rail toggle on a desktop */}
      <button
        type="button"
        onClick={onOpenDrawer}
        title={t("openMenu")}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground lg:hidden"
      >
        <MenuIcon aria-hidden className="size-4.5" strokeWidth={1.9} />
        <span className="sr-only">{t("openMenu")}</span>
      </button>

      <button
        type="button"
        onClick={onToggleSidebar}
        title={collapsed ? t("expand") : t("collapse")}
        className="hidden size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground lg:grid"
      >
        {collapsed ? (
          <PanelLeft aria-hidden className="size-4" strokeWidth={1.9} />
        ) : (
          <PanelLeftClose aria-hidden className="size-4" strokeWidth={1.9} />
        )}
        <span className="sr-only">{collapsed ? t("expand") : t("collapse")}</span>
      </button>

      <ArchiveSwitcher />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <CommandPalette />
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  );
}
