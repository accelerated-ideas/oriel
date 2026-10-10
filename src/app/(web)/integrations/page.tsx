import type { Metadata } from "next";
import { appUrl, BRAND } from "@/config/brand";
import { ListingCard } from "@/components/web/integrations/listing-page";
import { LISTINGS } from "@/components/web/integrations/listings";
import { FinalCta } from "@/components/web/landing/final-cta";
import { JsonLd, pageMetadata, webPage } from "@/components/web/seo";

const DESCRIPTION = `Connect ${BRAND.name} to Stripe, Slack, Zendesk, Salesforce, HubSpot, Cal.com and Calendly, so your product's voice assistant handles billing, tickets, leads and meetings for you.`;

export const metadata: Metadata = pageMetadata({ title: "Integrations", description: DESCRIPTION, path: "/integrations" });

export default function IntegrationsPage() {
  return (
    <>
      <JsonLd
        graph={[
          webPage({ path: "/integrations", name: "Integrations", description: DESCRIPTION }),
          {
            "@type": "ItemList",
            "@id": appUrl("/integrations#list"),
            name: `${BRAND.name} integrations`,
            itemListElement: LISTINGS.map((listing, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: listing.name,
              url: appUrl(`/integrations/${listing.slug}`),
            })),
          },
        ]}
      />
      <section className="px-3 pt-10 pb-24 sm:px-5 sm:pt-16 sm:pb-32 lg:pt-20">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <h1 className="headline text-[52px] leading-[0.92] font-semibold tracking-[-0.045em] text-balance sm:text-[84px]">Integrations</h1>
          <p className="max-w-[440px] text-[17px] leading-relaxed text-pretty text-muted lg:pb-2">
            Connect the tools your team already uses. The assistant handles billing, opens tickets, saves leads and books meetings
            in them, right in the conversation.
          </p>
        </header>
        <div className="mt-12 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:mt-16 lg:grid-cols-3">
          {LISTINGS.map((listing) => (
            <ListingCard key={listing.slug} listing={listing} />
          ))}
        </div>
        <p className="mt-8 max-w-[640px] text-[15px] leading-relaxed text-pretty text-muted">
          Follow-up requests can also go to an email address or your own webhook, on every plan.
        </p>
      </section>
      <FinalCta />
    </>
  );
}
