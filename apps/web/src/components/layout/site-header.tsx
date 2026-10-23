"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Menu, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/wordmark";
import { ThemeToggle } from "./theme-toggle";
import { LocaleSwitcher } from "./locale-switcher";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/#problem", key: "problem", route: false },
  { href: "/#evidence", key: "evidence", route: false },
  { href: "/#architecture", key: "architecture", route: false },
  { href: "/#capabilities", key: "capabilities", route: false },
  { href: "/#governance", key: "governance", route: false },
  { href: "/about", key: "about", route: true },
  { href: "/contact", key: "contact", route: true },
] as const;

export function SiteHeader() {
  const t = useTranslations("nav");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The mobile sheet owns the viewport while open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled || open
          ? "border-b border-line bg-background/85 backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[84rem] items-center gap-4 px-5 sm:px-8 lg:h-18 lg:px-12">
        <Link href="/" className="shrink-0" aria-label="ZEITZEUGE">
          <Wordmark eager />
        </Link>

        <nav className="ml-3 hidden items-center gap-0.5 xl:flex" aria-label="Primary">
          {NAV.map((item) =>
            item.route ? (
              <Link
                key={item.key}
                href={item.href}
                className="shrink-0 whitespace-nowrap rounded-lg px-2.5 py-2 text-[0.8125rem] font-medium text-muted transition-colors duration-200 hover:bg-surface-2 hover:text-foreground"
              >
                {t(item.key)}
              </Link>
            ) : (
              <a
                key={item.key}
                href={item.href}
                className="shrink-0 whitespace-nowrap rounded-lg px-2.5 py-2 text-[0.8125rem] font-medium text-muted transition-colors duration-200 hover:bg-surface-2 hover:text-foreground"
              >
                {t(item.key)}
              </a>
            ),
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitcher className="hidden sm:flex" />
          <ThemeToggle className="hidden sm:flex" />
          <Link
            href="/auth/login"
            className="hidden shrink-0 whitespace-nowrap rounded-lg px-2.5 py-2 text-[0.8125rem] font-medium text-muted transition-colors duration-200 hover:bg-surface-2 hover:text-foreground 2xl:inline-flex"
          >
            {t("signIn")}
          </Link>

          <Button
            as={Link}
            href="/auth/signup"
            size="sm"
            className="hidden shrink-0 whitespace-nowrap lg:inline-flex"
          >
            {t("demo")}
            <ArrowRight className="size-3.5" strokeWidth={2} />
          </Button>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="grid size-9 place-items-center rounded-lg border border-line text-foreground transition-colors hover:bg-surface-2 xl:hidden"
          >
            {open ? (
              <X className="size-4.5" strokeWidth={1.9} />
            ) : (
              <Menu className="size-4.5" strokeWidth={1.9} />
            )}
            <span className="sr-only">{open ? t("closeMenu") : t("openMenu")}</span>
          </button>
        </div>
      </div>

      <div
        id="mobile-nav"
        hidden={!open}
        className="border-t border-line bg-background/95 backdrop-blur-xl xl:hidden"
      >
        <nav
          className="mx-auto flex w-full max-w-[84rem] flex-col gap-1 px-5 py-5 sm:px-8"
          aria-label="Primary"
        >
          {NAV.map((item) =>
            item.route ? (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 font-display text-lg font-medium text-foreground transition-colors hover:bg-surface-2"
              >
                {t(item.key)}
              </Link>
            ) : (
              <a
                key={item.key}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 font-display text-lg font-medium text-foreground transition-colors hover:bg-surface-2"
              >
                {t(item.key)}
              </a>
            ),
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
          <Link
            href="/auth/login"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-3 font-display text-lg font-medium text-foreground transition-colors hover:bg-surface-2"
          >
            {t("signIn")}
          </Link>
          <Button
            as={Link}
            href="/auth/signup"
            className="mt-3 w-full"
            onClick={() => setOpen(false)}
          >
            {t("demo")}
            <ArrowRight className="size-4" strokeWidth={2} />
          </Button>
        </nav>
      </div>
    </header>
  );
}
