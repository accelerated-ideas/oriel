import { BRAND } from "@/config/brand";
import { LEGAL } from "@/config/legal";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/components/web/og/og-image";

export const alt = `${BRAND.name} terms of service`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    title: "Terms of service",
    subtitle: `The terms for using the hosted ${BRAND.name} service. Updated ${LEGAL.updated}.`,
  });
}
