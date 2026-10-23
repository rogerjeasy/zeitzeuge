import { useTranslations } from "next-intl";
import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import { BRANDS } from "@/lib/data/brands";
import { CHANNELS, SOCIALS } from "@/lib/data/contact";
import { BrandIcon } from "./brand-icon";

const ICONS = { mail: Mail, phone: Phone, location: MapPin } as const;

/** Direct channels and the accounts, beside the form rather than under it. */
export function ContactAside() {
  const t = useTranslations("contact");

  return (
    <aside className="flex flex-col gap-5">
      <section
        aria-labelledby="channels-heading"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6"
      >
        <h2
          id="channels-heading"
          className="font-display text-[1rem] font-semibold tracking-[-0.015em] text-foreground-strong"
        >
          {t("channelsTitle")}
        </h2>

        <ul className="flex flex-col divide-y divide-line">
          {CHANNELS.map((channel) => {
            const Icon = ICONS[channel.icon];
            const body = (
              <>
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-evidence-soft text-evidence">
                  <Icon aria-hidden className="size-4" strokeWidth={1.9} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">
                    {t(`channels.${channel.id}`)}
                  </span>
                  <span className="min-w-0 break-words text-[0.875rem] text-foreground-strong">
                    {channel.value}
                  </span>
                </span>
              </>
            );

            return (
              <li key={channel.id} className="py-2.5 first:pt-0 last:pb-0">
                {channel.href ? (
                  <a
                    href={channel.href}
                    className="group flex items-center gap-3 rounded-lg transition-colors hover:text-evidence"
                  >
                    {body}
                  </a>
                ) : (
                  <span className="flex items-center gap-3">{body}</span>
                )}
              </li>
            );
          })}
        </ul>

        <p className="border-t border-line pt-3 text-[0.75rem] leading-relaxed text-muted">
          {t("responseNote")}
        </p>
      </section>

      <section
        aria-labelledby="social-heading"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6"
      >
        <h2
          id="social-heading"
          className="font-display text-[1rem] font-semibold tracking-[-0.015em] text-foreground-strong"
        >
          {t("socialTitle")}
        </h2>

        <ul className="grid gap-2 sm:grid-cols-2">
          {SOCIALS.map((social) => {
            const brand = BRANDS[social.brand];
            return (
              <li key={social.brand}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group flex items-center gap-2.5 rounded-lg border border-line bg-surface-2/40 px-3 py-2.5 transition-colors duration-200 hover:border-line-strong hover:bg-surface-2"
                >
                  <BrandIcon brand={social.brand} className="size-5" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[0.8125rem] font-medium leading-snug text-foreground-strong">
                      {brand.name}
                    </span>
                    <span className="truncate font-mono text-[0.6875rem] text-muted-2">
                      {social.handle}
                    </span>
                  </span>
                  <ArrowUpRight
                    aria-hidden
                    className="ml-auto size-3.5 shrink-0 text-muted-2 transition-colors group-hover:text-evidence"
                    strokeWidth={2}
                  />
                </a>
              </li>
            );
          })}
        </ul>

        <p className="border-t border-line pt-3 text-[0.75rem] leading-relaxed text-muted-2">
          {t("socialNote")}
        </p>
      </section>
    </aside>
  );
}
