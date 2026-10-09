import type { MetadataRoute } from "next";
import { appUrl } from "@/config/brand";
import { IS_CLOUD } from "@/config/edition";

// Search engines get the public site and nothing else: not the dashboard,
// sign-in, invitations, the API or the widget's frame. A self-hosted install
// has no public site, so it's closed entirely.
export default function robots(): MetadataRoute.Robots {
  if (!IS_CLOUD) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/admin", "/api/", "/auth", "/invite", "/widget"],
    },
    sitemap: appUrl("/sitemap.xml"),
  };
}
