import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IS_CLOUD } from "@/config/edition";
import { Analytics } from "@/components/consent/analytics";
import { ConsentBanner } from "@/components/consent/consent-banner";
import { DemoBubble } from "@/components/web/demo-bubble";
import { MotionProvider } from "@/components/web/landing/motion";
import { SiteFooter } from "@/components/web/landing/site-footer";
import { SiteNav } from "@/components/web/landing/site-nav";
import { JsonLd, siteGraph } from "@/components/web/seo";
import paper from "@/components/ui/paper.module.css";

// The rest of the app stays out of search (app/layout.tsx); these pages are for it.
export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

// The marketing site: landing, pricing and the legal pages. It belongs to the
// hosted edition; self-hosted installs serve the dashboard instead.
export default function WebLayout({ children }: { children: React.ReactNode }) {
  if (!IS_CLOUD) notFound();

  return (
    <MotionProvider>
      <JsonLd graph={siteGraph()} />
      <div className={`${paper.paper} min-h-dvh overflow-x-clip`}>
        <SiteNav />
        <main className="mx-auto max-w-[1400px] px-2 pb-2 sm:px-5">{children}</main>
        <SiteFooter />
        <DemoBubble />
        <ConsentBanner />
        <Analytics />
      </div>
    </MotionProvider>
  );
}
