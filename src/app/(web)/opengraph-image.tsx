import { BRAND } from "@/config/brand";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/components/web/og/og-image";

export const alt = `${BRAND.name}: a voice assistant that helps people understand and use your product`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    title: "Talk every user through it.",
    subtitle: "A voice assistant that helps people understand and use your product.",
  });
}
