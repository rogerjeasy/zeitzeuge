"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { Menu, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { cn } from "@/lib/cn";

const ITEMS = ["n1", "n2", "n3"] as const;

export function NotificationsMenu() {
  const t = useTranslations("app.header");
  const tn = useTranslations("app.notifications");
  const [read, setRead] = useState(false);

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
          {!read && (
            <span
              aria-hidden
              className="absolute right-2 top-2 size-1.5 rounded-full bg-review ring-2 ring-surface"
            />
          )}
          <span className="sr-only">{t("notifications")}</span>
        </button>
      )}
    >
      {() => (
        <>
          <MenuLabel>{t("notifications")}</MenuLabel>
          <ul className="flex flex-col">
            {ITEMS.map((id) => (
              <li key={id}>
                <a
                  href="#"
                  className="flex flex-col gap-0.5 rounded-lg px-2.5 py-2 transition-colors duration-150 hover:bg-surface-2"
                >
                  <span className="flex items-start gap-2 text-[0.8125rem] leading-snug text-foreground">
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        read ? "bg-line-strong" : "bg-evidence",
                      )}
                    />
                    {tn(id)}
                  </span>
                  <span className="pl-3.5 font-mono text-[0.5625rem] text-muted-2">
                    {tn(`${id}meta`)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <MenuSeparator />
          <button
            type="button"
            onClick={() => setRead(true)}
            disabled={read}
            className="w-full rounded-lg px-2.5 py-1.5 text-left text-[0.75rem] text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
          >
            {t("markAllRead")}
          </button>
        </>
      )}
    </Menu>
  );
}
