import { BRAND } from "@/config/brand";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/components/web/og/og-image";

export const alt = `${BRAND.name} integrations`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    title: "Integrations",
    subtitle: "Stripe, Slack, Zendesk, Salesforce, HubSpot, Cal.com and Calendly, right in the conversation.",
  });
}
