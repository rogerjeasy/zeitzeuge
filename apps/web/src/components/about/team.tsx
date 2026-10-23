import Image from "next/image";
import { useTranslations } from "next-intl";
import { GraduationCap } from "lucide-react";
import { TEAM } from "@/lib/data/about";

/**
 * Two people, at the same size and in the same frame.
 *
 * The photographs are working shots rather than studio headshots, cropped to a
 * common 4:5 so the pair reads as one set. On a team of two, an asymmetry in
 * how the two are presented would say something neither of them meant.
 */
export function Team() {
  const t = useTranslations("about");

  return (
    <section className="border-b border-line bg-surface-2/40">
      <div className="mx-auto flex w-full max-w-[84rem] flex-col gap-8 px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="flex max-w-[60ch] flex-col gap-3">
          <h2 className="font-display text-[clamp(1.5rem,1.2rem+1.4vw,2.25rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
            {t("teamTitle")}
          </h2>
          <p className="text-[0.9375rem] leading-relaxed text-muted">{t("teamLede")}</p>
        </div>

        <ul className="grid gap-5 md:grid-cols-2 lg:gap-6">
          {TEAM.map((member) => (
            <li
              key={member.id}
              className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-plate sm:flex-row"
            >
              <figure className="relative aspect-[4/5] w-full shrink-0 bg-surface-2 sm:aspect-auto sm:w-[11.5rem] lg:w-[13rem]">
                <Image
                  src={member.photo}
                  alt={member.name}
                  fill
                  sizes="(max-width: 639px) 100vw, 13rem"
                  className="object-cover object-top"
                />
              </figure>

              <div className="flex min-w-0 flex-1 flex-col gap-3 p-5 sm:p-6">
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-display text-[1.125rem] font-semibold tracking-[-0.015em] text-foreground-strong">
                    {member.name}
                  </h3>

                  <p className="text-[0.8125rem] leading-snug text-foreground">
                    {member.role}
                    <span className="text-muted">
                      {" · "}
                      {member.team}
                    </span>
                  </p>

                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-evidence-soft px-2 py-0.5 text-evidence">
                      <GraduationCap aria-hidden className="size-3" strokeWidth={2} />
                      {t("workingStudent")}
                    </span>
                    <span>
                      {t("at")} {member.employer}
                    </span>
                  </p>
                </div>

                <p className="text-[0.875rem] leading-[1.75] text-muted">
                  {t(`bios.${member.id}`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
