import "server-only";
import { appUrl, BRAND } from "@/config/brand";
import type { BillingPeriod, SubscriptionPlan } from "@/config/plans";
import { sendEmail } from "@/lib/email";
import {
  button,
  checkList,
  emailTextFromHtml,
  escapeHtml,
  heading,
  link,
  paragraph,
  renderEmailLayout,
  signature,
  subheading,
} from "./template";

type Subscribed = { plan: SubscriptionPlan; period: BillingPeriod; workspace: { id: string; name: string } };

export function renderSubscribedEmail({ plan, period, workspace }: Subscribed) {
  const subject = `You're on ${BRAND.name} ${plan.name}`;
  const content = [
    heading(`You&apos;re on ${plan.name}`),
    paragraph(
      `Thanks for subscribing. <strong style="color: #161411;">${escapeHtml(workspace.name)}</strong> is on ${plan.name} now, billed ${period === "annual" ? "yearly" : "monthly"}. Your messages renew every month on your billing date.`,
    ),
    subheading("What's included"),
    checkList(plan.style.feature_list.map((feature) => ({ text: escapeHtml(feature.label) }))),
    button({ label: "Open your workspace", href: appUrl(`/account/${workspace.id}/agents`) }),
    paragraph(
      `Invoices, your card and your plan are on the ${link(appUrl(`/account/${workspace.id}/billing`), "Billing")} page. If anything doesn&apos;t work the way you&apos;d expect, reply to this email.`,
    ),
    signature({ name: "Vlad", role: `Founder, ${BRAND.name}` }),
  ].join("\n");

  const html = renderEmailLayout({
    title: subject,
    preheader: `${plan.name} is active for ${workspace.name}. Here's what it includes.`,
    content,
    reason: `You're getting this email because you subscribed to ${BRAND.name}.`,
  });
  return { subject, html, text: emailTextFromHtml(html) };
}

export async function sendSubscribedEmail(to: string, details: Subscribed) {
  const { subject, html, text } = renderSubscribedEmail(details);
  await sendEmail({ to, subject, html, text });
}
