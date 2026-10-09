import type { MetadataRoute } from "next";
import { appUrl } from "@/config/brand";
import { IS_CLOUD } from "@/config/edition";
import { LEGAL_UPDATED_AT } from "@/config/legal";

// The public site's pages. Only the hosted edition has them; a self-hosted
// install is just the dashboard.
export default function sitemap(): MetadataRoute.Sitemap {
  if (!IS_CLOUD) return [];
  return [
    { url: appUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: appUrl("/pricing"), changeFrequency: "monthly", priority: 0.8 },
    { url: appUrl("/terms"), lastModified: LEGAL_UPDATED_AT, changeFrequency: "yearly", priority: 0.3 },
    { url: appUrl("/privacy"), lastModified: LEGAL_UPDATED_AT, changeFrequency: "yearly", priority: 0.3 },
  ];
}
