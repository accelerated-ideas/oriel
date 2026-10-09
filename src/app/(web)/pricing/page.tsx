import type { Metadata } from "next";
import { Faq, type Question } from "@/components/web/landing/faq";
import { FinalCta } from "@/components/web/landing/final-cta";
import { PlanComparison } from "@/components/web/landing/plan-comparison";
import { Pricing } from "@/components/web/landing/pricing";
import { faqPage, JsonLd, pageMetadata, softwareApplication, webPage } from "@/components/web/seo";
import { publicPlans } from "@/config/plans";

const DESCRIPTION = "Plans for the hosted service, priced by the messages your visitors send. Free and open source to run yourself.";

export const metadata: Metadata = pageMetadata({ title: "Pricing", description: DESCRIPTION, path: "/pricing" });

// How billing actually behaves: src/lib/billing (limits and plan state) and src/config/subscription-plans.ts.
const QUESTIONS: Question[] = [
  {
    q: "What counts as a message?",
    a: "Each message a visitor sends, whether they say it or type it. The assistant's replies, the greeting, and the goodbye that ends a conversation don't count. Counts start again each calendar month.",
  },
  {
    q: "What happens if we reach the limit?",
    a: "The assistant pauses until the next month starts, and its button disappears from your site. You're never charged for going over. Move to a bigger plan and it's back right away.",
  },
  {
    q: "How does the free trial work?",
    a: "You get 14 days with every feature and 100 messages, with no card needed. There's one trial per person.",
  },
  {
    q: "Can we change plans or cancel?",
    a: "Yes, any time from Billing in your workspace. Plan changes are prorated. If you cancel, your plan runs until the end of the period you've paid for, and your workspace and its data stay where they are.",
  },
  {
    q: "What if a payment fails?",
    a: "Your assistant keeps working while Stripe tries the card again, and you can update it from Billing.",
  },
  {
    q: "Can we run it ourselves instead?",
    a: "Yes, for free. The whole app is open source under AGPL-3.0. Run it on your own servers with your own model and voice keys, with every feature and no message limits.",
  },
];

export default function PricingPage() {
  return (
    <>
      <JsonLd
        graph={[
          webPage({ path: "/pricing", name: "Pricing", description: DESCRIPTION }),
          softwareApplication(publicPlans),
          faqPage("/pricing", QUESTIONS),
        ]}
      />
      <Pricing />
      <PlanComparison />
      <Faq title="Questions about pricing" questions={QUESTIONS} />
      <FinalCta />
    </>
  );
}
