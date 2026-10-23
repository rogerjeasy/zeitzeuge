import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LogoLockup } from "@/components/ui/logo";
import { IMAGE_SOURCES } from "@/lib/data/archive";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";

const COLUMNS = [
  { heading: "product", links: ["demo", "capabilities", "architecture", "evaluation"] },
  { heading: "resources", links: ["about", "contact", "docs", "api", "standards", "status"] },
  { heading: "legal", links: ["privacy", "terms", "accessibility", "imprint"] },
] as const;

/**
 * Every footer entry, and where it goes.
 *
 * Two of them are sections of the landing page rather than routes of their own,
 * so they are written as page-qualified anchors — a bare `#capabilities` leads
 * nowhere from any of the pages this footer also appears on.
 */
const ROUTES: Record<string, string> = {
  demo: "/auth/signup",
  capabilities: "/#capabilities",
  architecture: "/#architecture",
  evaluation: "/evaluation",

  about: "/about",
  docs: "/docs",
  api: "/api",
  standards: "/standards",
  status: "/status",

  privacy: "/privacy",
  terms: "/terms",
  accessibility: "/accessibility",
  imprint: "/imprint",

  contact: "/contact",
};

export function SiteFooter() {
  const t = useTranslations("footer");

  return (
    <footer className="border-t border-line bg-surface-2/40">
      <div className="mx-auto w-full max-w-[84rem] px-5 py-14 sm:px-8 sm:py-16 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)] lg:gap-16">
          <div className="flex flex-col gap-5">
            <Link href="/" aria-label="ZEITZEUGE" className="w-fit">
              <LogoLockup className="h-14 sm:h-16" />
            </Link>
            <p className="max-w-[34ch] text-[0.8125rem] leading-relaxed text-muted">
              {t("tagline")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <LocaleSwitcher />
              <ThemeToggle />
            </div>
          </div>

          <nav className="grid grid-cols-2 gap-8 sm:grid-cols-3" aria-label="Footer">
            {COLUMNS.map((column) => (
              <div key={column.heading} className="flex flex-col gap-3">
                <h2 className="font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-muted-2">
                  {t(column.heading)}
                </h2>
                <ul className="flex flex-col gap-2">
                  {column.links.map((link) => (
                    <li key={link}>
                      <Link
                        href={ROUTES[link]}
                        className="text-[0.8125rem] text-muted transition-colors duration-200 hover:text-foreground"
                      >
                        {t(`links.${link}`)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        {/* Image credit is not a footnote here: the whole page is built on other
            people's digitised heritage, and saying whose is part of the pitch. */}
        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6">
          <h2 className="font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-muted-2">
            {t("imageCreditTitle")}
          </h2>
          <p className="max-w-[86ch] text-[0.6875rem] leading-relaxed text-muted-2">
            {t("imageCreditIntro")}
          </p>

          <ul className="flex flex-col gap-1.5">
            {IMAGE_SOURCES.map((source) => (
              <li
                key={source.collection}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[0.6875rem] leading-relaxed text-muted-2"
              >
                <a
                  href={source.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-foreground"
                >
                  {source.collection}
                </a>
                <span>· {source.holder}</span>
                <span className="font-mono text-[0.625rem] uppercase tracking-[0.08em]">
                  {source.license}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-2">
            {t("rights", { year: 2026 })}
          </p>
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-2">
            {t("builtFor")}
          </p>
        </div>
      </div>
    </footer>
  );
}
