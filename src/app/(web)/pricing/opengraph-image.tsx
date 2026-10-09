import { BRAND } from "@/config/brand";
import { publicPlans } from "@/config/plans";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/components/web/og/og-image";

export const alt = `${BRAND.name} pricing`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// The cheapest hosted plan, billed monthly.
const from = Math.min(...publicPlans.filter((plan) => !plan.is_free_plan).map((plan) => plan.price_config.price));

export default function Image() {
  return ogImage({
    title: "Pricing",
    subtitle: `Free and open source to run yourself. Hosted plans from $${from} a month.`,
  });
}
