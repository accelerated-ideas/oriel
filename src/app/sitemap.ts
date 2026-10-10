import type { MetadataRoute } from "next";
import { appUrl } from "@/config/brand";
import { IS_CLOUD } from "@/config/edition";
import { LEGAL_UPDATED_AT } from "@/config/legal";
import { LISTINGS } from "@/components/web/integrations/listings";

// The public site's pages. Only the hosted edition has them; a self-hosted
// install is just the dashboard.
export default function sitemap(): MetadataRoute.Sitemap {
  if (!IS_CLOUD) return [];
  return [
    { url: appUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: appUrl("/pricing"), changeFrequency: "monthly", priority: 0.8 },
    { url: appUrl("/integrations"), changeFrequency: "monthly", priority: 0.7 },
    ...LISTINGS.map((listing) => ({
      url: appUrl(`/integrations/${listing.slug}`),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    { url: appUrl("/terms"), lastModified: LEGAL_UPDATED_AT, changeFrequency: "yearly", priority: 0.3 },
    { url: appUrl("/privacy"), lastModified: LEGAL_UPDATED_AT, changeFrequency: "yearly", priority: 0.3 },
  ];
}
