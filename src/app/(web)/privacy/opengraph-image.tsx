import { BRAND } from "@/config/brand";
import { LEGAL } from "@/config/legal";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/components/web/og/og-image";

export const alt = `${BRAND.name} privacy policy`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    title: "Privacy policy",
    subtitle: `What the hosted ${BRAND.name} service collects, why, and who it shares it with. Updated ${LEGAL.updated}.`,
  });
}
