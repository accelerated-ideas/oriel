import "server-only";
import { BRAND } from "@/config/brand";

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

// Plain-text email through Resend. Returns false when email isn't set up or
// sending failed, so callers can fall back (e.g. show a link to copy).
export async function sendEmail({
  to,
  subject,
  text,
  replyTo,
}: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}) {
  if (!emailConfigured()) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || `${BRAND.name} <notifications@example.com>`,
        to: [to],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject,
        text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) console.error("Email failed", response.status, await response.text());
    return response.ok;
  } catch (error) {
    console.error("Email failed", error);
    return false;
  }
}
