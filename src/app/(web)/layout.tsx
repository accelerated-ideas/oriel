import { notFound } from "next/navigation";
import { IS_CLOUD } from "@/config/edition";
import { Analytics } from "@/components/web/consent/analytics";
import { ConsentBanner } from "@/components/web/consent/consent-banner";
import { DemoBubble } from "@/components/web/demo-bubble";
import { MotionProvider } from "@/components/web/landing/motion";
import { SiteFooter } from "@/components/web/landing/site-footer";
import { SiteNav } from "@/components/web/landing/site-nav";
import paper from "@/components/ui/paper.module.css";

// The marketing site: landing, pricing and the legal pages. It belongs to the
// hosted edition; self-hosted installs serve the dashboard instead.
export default function WebLayout({ children }: { children: React.ReactNode }) {
  if (!IS_CLOUD) notFound();

  return (
    <MotionProvider>
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
