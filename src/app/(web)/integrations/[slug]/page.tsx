import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingPage } from "@/components/web/integrations/listing-page";
import { getListing, LISTINGS } from "@/components/web/integrations/listings";
import { faqPage, JsonLd, pageMetadata, webPage } from "@/components/web/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return LISTINGS.map((listing) => ({ slug: listing.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const listing = getListing((await params).slug);
  if (!listing) return {};
  return pageMetadata({ title: `${listing.name} integration`, description: listing.description, path: `/integrations/${listing.slug}` });
}

export default async function IntegrationPage({ params }: { params: Promise<{ slug: string }> }) {
  const listing = getListing((await params).slug);
  if (!listing) notFound();
  const path = `/integrations/${listing.slug}`;

  return (
    <>
      <JsonLd
        graph={[
          webPage({
            path,
            name: `${listing.name} integration`,
            description: listing.description,
            parents: [{ name: "Integrations", path: "/integrations" }],
          }),
          faqPage(path, listing.questions),
        ]}
      />
      <ListingPage listing={listing} />
    </>
  );
}
