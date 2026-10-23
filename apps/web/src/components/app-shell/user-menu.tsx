"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { User, Settings, LogOut, ChevronDown } from "lucide-react";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { useSessionUser } from "@/components/auth/session-provider";
import { useRouter } from "@/i18n/navigation";
import { auth } from "@/lib/auth/client";
import { LOGIN_PATH } from "@/lib/auth/routes";

export function UserMenu() {
  const t = useTranslations("app.header");
  const user = useSessionUser();
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();

  function signOut() {
    startSignOut(async () => {
      await auth.signOut();
      // `replace`, so Back does not return to a screen the session no longer opens.
      router.replace(LOGIN_PATH);
      router.refresh();
    });
  }

  return (
    <Menu
      label={t("userMenu")}
      panelClassName="w-[15.5rem]"
      trigger={(props) => (
        <button
          type="button"
          data-menu-trigger
          onClick={props.toggle}
          aria-expanded={props["aria-expanded"]}
          aria-haspopup={props["aria-haspopup"]}
          aria-controls={props["aria-controls"]}
          className="flex h-9 items-center gap-2 rounded-lg pl-1 pr-1.5 transition-colors duration-150 hover:bg-surface-2"
        >
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-full bg-evidence-soft font-mono text-[0.625rem] font-semibold text-evidence"
          >
            {user.initials}
          </span>
          <ChevronDown aria-hidden className="size-3.5 text-muted-2" strokeWidth={2} />
          <span className="sr-only">{t("userMenu")}</span>
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-full bg-evidence-soft font-mono text-[0.75rem] font-semibold text-evidence"
            >
              {user.initials}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[0.8125rem] font-medium text-foreground-strong">
                {user.displayName}
              </span>
              <span className="truncate text-[0.6875rem] text-muted-2">
                {user.isGuest ? t("guestBadge") : user.organizationName}
              </span>
            </span>
          </div>

          <MenuSeparator />

          <MenuItem
            icon={<User aria-hidden className="size-4 text-muted-2" strokeWidth={1.9} />}
            onClick={() => {
              close();
              router.push("/profile");
            }}
          >
            {t("profile")}
          </MenuItem>
          <MenuItem
            icon={<Settings aria-hidden className="size-4 text-muted-2" strokeWidth={1.9} />}
            onClick={() => {
              close();
              router.push("/settings");
            }}
          >
            {t("settings")}
          </MenuItem>

          <MenuSeparator />

          {/* The only place these are guaranteed reachable at every width. */}
          <div className="flex flex-col gap-2 px-2.5 py-2">
            <LocaleSwitcher className="w-fit" />
            <ThemeToggle className="w-fit" />
          </div>

          <MenuSeparator />

          <MenuItem
            icon={<LogOut aria-hidden className="size-4" strokeWidth={1.9} />}
            onClick={() => {
              close();
              signOut();
            }}
            disabled={signingOut}
            className="text-refuted hover:bg-refuted-soft"
          >
            {t("signOut")}
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
