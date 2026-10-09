import { appUrl } from "@/config/brand";
import { Faq } from "@/components/web/landing/faq";
import { Features } from "@/components/web/landing/features";
import { FinalCta } from "@/components/web/landing/final-cta";
import { Hero } from "@/components/web/landing/hero";
import { OpenSource } from "@/components/web/landing/open-source";
import { Questions } from "@/components/web/landing/questions";
import { Safety } from "@/components/web/landing/safety";
import { Setup } from "@/components/web/landing/setup";

export default function LandingPage() {
  return (
    <>
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
