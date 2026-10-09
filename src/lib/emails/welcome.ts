import "server-only";
import { appUrl, BRAND } from "@/config/brand";
import { IS_CLOUD } from "@/config/edition";
import { getPlan, TRIAL_PLAN_ID } from "@/config/plans";
import { emailConfigured, sendEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { button, checkList, emailTextFromHtml, heading, paragraph, renderEmailLayout, signature, subheading } from "./template";

export function renderWelcomeEmail() {
  const trial = getPlan(TRIAL_PLAN_ID)!.includes;
  const subject = `Welcome to ${BRAND.name}`;
  const content = [
    heading(`Welcome to ${BRAND.name}`),
    paragraph(
      `Thanks for signing up. ${BRAND.name} is a voice assistant that helps your users understand and use your product. It answers their questions, explains how things work, shows them where to go, and can handle tasks along the way.`,
    ),
    paragraph(
      `Your trial runs for ${trial.trial_days} days with ${trial.messages_per_month} messages, with everything included and no card needed.`,
    ),
    subheading("Getting it running"),
    checkList([
      { title: "Create your assistant.", text: "Give it a name and your website.", href: appUrl("/account"), linkLabel: "Start here" },
      { title: "Teach it your product.", text: "Under Knowledge, import your site, docs and files." },
      { title: "Show it around.", text: "In Site map, add the pages it can take people to." },
      { title: "Try it, then go live.", text: "Talk to it in Playground, then add it to your site with the snippet from Install." },
    ]),
    button({ label: `Open ${BRAND.name}`, href: appUrl("/account") }),
    paragraph("If you get stuck, or something doesn&apos;t make sense, reply to this email. It comes straight to me."),
    signature({ name: "Vlad", role: `Founder, ${BRAND.name}` }),
  ].join("\n");

  const html = renderEmailLayout({
    title: subject,
    preheader: `Your ${trial.trial_days}-day trial has started. Here's how to get your assistant talking.`,
    content,
    reason: `You're getting this email because you created an account on ${BRAND.name}.`,
  });
  return { subject, html, text: emailTextFromHtml(html) };
}

// Once per person, the first time they sign in (hosted edition only). The
// claim comes first, so two sign-ins at once send one email; a failed send
// lets the next sign-in try again.
export async function sendWelcomeEmailOnce(user: { id: string; email?: string | null }) {
  if (!IS_CLOUD || !user.email || !emailConfigured()) return;
  const { data: claimed } = await supabaseAdmin
    .from("users")
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("welcome_email_sent_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  const { subject, html, text } = renderWelcomeEmail();
  if (!(await sendEmail({ to: user.email, subject, html, text }))) {
    await supabaseAdmin.from("users").update({ welcome_email_sent_at: null }).eq("id", user.id);
  }
}
