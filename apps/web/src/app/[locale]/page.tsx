import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Hero } from "@/components/hero/hero";
import { TrustBar } from "@/components/sections/trust-bar";
import { ProblemSection } from "@/components/sections/problem-section";
import { EvidenceLedgerSection } from "@/components/sections/evidence-ledger-section";
import { AgentOrchestraSection } from "@/components/sections/agent-orchestra-section";
import { CapabilitiesSection } from "@/components/sections/capabilities-section";
import { CalibrationSection } from "@/components/sections/calibration-section";
import { PersonasSection } from "@/components/sections/personas-section";
import { SovereigntySection } from "@/components/sections/sovereignty-section";
import { CtaSection } from "@/components/sections/cta-section";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <main id="main">
        <Hero />
        <TrustBar />
        <ProblemSection />
        <EvidenceLedgerSection />
        <AgentOrchestraSection />
        <CapabilitiesSection />
        <CalibrationSection />
        <PersonasSection />
        <SovereigntySection />
        <CtaSection />
      </main>
      <SiteFooter />
    </>
  );
}
