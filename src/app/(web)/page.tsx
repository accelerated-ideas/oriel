import type { Metadata } from "next";
import { appUrl, BRAND } from "@/config/brand";
import { publicPlans } from "@/config/plans";
import { LANDING_QUESTIONS } from "@/components/web/landing/faq-questions";
import { faqPage, JsonLd, pageMetadata, SITE_DESCRIPTION, softwareApplication } from "@/components/web/seo";
import { Faq } from "@/components/web/landing/faq";
import { Features } from "@/components/web/landing/features";
import { FinalCta } from "@/components/web/landing/final-cta";
import { Hero } from "@/components/web/landing/hero";
import { OpenSource } from "@/components/web/landing/open-source";
import { Questions } from "@/components/web/landing/questions";
import { Safety } from "@/components/web/landing/safety";
import { Setup } from "@/components/web/landing/setup";

export const metadata: Metadata = pageMetadata({
  title: { absolute: `${BRAND.name} — ${BRAND.tagline}` },
  description: SITE_DESCRIPTION,
  path: "/",
});

export default function LandingPage() {
  return (
    <>
      <JsonLd graph={[softwareApplication(publicPlans), faqPage("/", LANDING_QUESTIONS)]} />
      <Hero />
      <Questions />
      <Features />
      <Setup scriptUrl={appUrl("/embed.js")} />
      <Safety />
      <OpenSource />
      <Faq />
      <FinalCta />
    </>
  );
}
