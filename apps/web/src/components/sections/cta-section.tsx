import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowRight, Play } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";
import { GALLERY } from "@/lib/data/archive";

export function CtaSection() {
  const t = useTranslations("cta");

  return (
    <section id="demo" className="relative scroll-mt-20 overflow-hidden bg-ink-panel text-ink-panel-fg">
      {/* A fan of unidentified plates behind the ask — the backlog, waiting. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 lg:block">
          {GALLERY.slice(0, 3).map((photo, i) => (
            <div
              key={photo.key}
              className="absolute overflow-hidden rounded-lg border border-ink-panel-line shadow-lift"
              style={{
                width: "58%",
                aspectRatio: "4 / 3",
                top: `${12 + i * 16}%`,
                right: `${4 + i * 13}%`,
                transform: `rotate(${(i - 1) * 4.5}deg)`,
                opacity: 0.2 + i * 0.1,
              }}
            >
              <Image
                src={photo.src}
                alt=""
                fill
                loading="lazy"
                sizes="30vw"
                className="object-cover grayscale"
              />
            </div>
          ))}
          <div className="absolute inset-0 bg-gradient-to-r from-ink-panel via-ink-panel/70 to-transparent" />
        </div>
        <div className="texture-grain absolute inset-0 opacity-40" />
      </div>

      <div className="relative mx-auto w-full max-w-[84rem] px-5 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-32">
        <Reveal className="flex max-w-[44rem] flex-col gap-6">
          <Eyebrow className="text-ink-panel-muted">{t("eyebrow")}</Eyebrow>

          <h2 className="max-w-[18ch] font-display text-[clamp(2rem,1.35rem+2.6vw,3.35rem)] font-semibold leading-[1.06] tracking-[-0.03em] text-balance-tight">
            {t("title")}
          </h2>

          <p className="max-w-[52ch] text-[0.9375rem] leading-[1.75] text-ink-panel-body sm:text-base">
            {t("body")}
          </p>

          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              as={Link}
              href="/auth/signup"
              size="lg"
              className="w-full bg-ink-panel-fg text-ink-panel hover:bg-white sm:w-auto"
            >
              <Play className="size-4" strokeWidth={2.2} />
              {t("primaryCta")}
            </Button>
            <Button
              as="a"
              href="#demo"
              size="lg"
              className="w-full border border-ink-panel-line bg-transparent text-ink-panel-fg hover:border-ink-panel-muted hover:bg-ink-panel-fg/5 sm:w-auto"
            >
              {t("secondaryCta")}
              <ArrowRight className="size-4" strokeWidth={2} />
            </Button>
          </div>

          <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-panel-muted">
            {t("note")}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
