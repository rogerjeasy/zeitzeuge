"use client";

import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { Menu, MenuLabel } from "@/components/ui/menu";

/**
 * Notifications have no source yet, so the menu says there is nothing new
 * rather than listing invented events.
 */
export function NotificationsMenu() {
  const t = useTranslations("app.header");

  return (
    <Menu
      label={t("notifications")}
      panelClassName="w-[19rem]"
      trigger={(props) => (
        <button
          type="button"
          data-menu-trigger
          onClick={props.toggle}
          aria-expanded={props["aria-expanded"]}
          aria-haspopup={props["aria-haspopup"]}
          aria-controls={props["aria-controls"]}
          title={t("notifications")}
          className="relative grid size-9 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-foreground"
        >
          <Bell aria-hidden className="size-4" strokeWidth={1.9} />
          <span className="sr-only">{t("notifications")}</span>
        </button>
      )}
    >
      {() => (
        <>
          <MenuLabel>{t("notifications")}</MenuLabel>
          <div className="flex flex-col gap-0.5 px-2.5 py-3">
            <p className="text-[0.8125rem] font-medium text-foreground">{t("notificationsEmpty")}</p>
            <p className="text-[0.75rem] leading-snug text-muted">{t("notificationsEmptyHint")}</p>
          </div>
        </>
      )}
    </Menu>
  );
}
