import { BRAND } from "@/config/brand";
import { getListing, LISTINGS } from "@/components/web/integrations/listings";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/components/web/og/og-image";

export const alt = `${BRAND.name} integration`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return LISTINGS.map((listing) => ({ slug: listing.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const listing = getListing((await params).slug)!;
  return ogImage({ title: `${BRAND.name} + ${listing.name}`, subtitle: listing.tagline });
}
