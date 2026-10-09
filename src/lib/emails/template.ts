import { BRAND } from "@/config/brand";
import { LEGAL } from "@/config/legal";

// The look of the landing page, for email: warm paper, ink, Funnel Display
// headlines and black pill buttons, with iris only in the logo. Tables and
// inline styles throughout, so Gmail, Apple Mail, Outlook and phones show the
// same thing. Copy in sentence case, without eyebrows or step numbers.

export const emailColors = {
  paper: "#f2efe9",
  card: "#fbfaf7",
  line: "#e2ded7",
  ink: "#161411",
  body: "#3a3631",
  muted: "#6c665d",
  iris: "#6352f2",
  irisSoft: "#e7e3fb",
  irisInk: "#4535c4",
} as const;

// Single quotes only: these go inside style="" attributes.
const SANS = "Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const DISPLAY = "'Funnel Display', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif";

const bodyText = `font-family: ${SANS}; font-size: 16px; line-height: 26px; color: ${emailColors.body};`;

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function heading(text: string) {
  return `<h1 style="margin: 0 0 18px 0; font-family: ${DISPLAY}; font-size: 32px; line-height: 36px; font-weight: 600; letter-spacing: -0.9px; color: ${emailColors.ink};">${text}</h1>`;
}

export function subheading(text: string) {
  return `<h2 style="margin: 30px 0 10px 0; font-family: ${DISPLAY}; font-size: 20px; line-height: 26px; font-weight: 600; letter-spacing: -0.4px; color: ${emailColors.ink};">${text}</h2>`;
}

export function paragraph(html: string) {
  return `<p style="margin: 0 0 16px 0; ${bodyText}">${html}</p>`;
}

export function link(href: string, text: string) {
  return `<a href="${href}" style="color: ${emailColors.irisInk}; text-decoration: none; font-weight: 600;">${text}</a>`;
}

// A black pill, like the landing page's. VML for Outlook on Windows.
export function button({ label, href }: { label: string; href: string }) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 10px 0 26px 0; border-collapse: separate;">
  <tr>
    <td class="email-button" align="center" style="border-radius: 9999px; background-color: ${emailColors.ink};">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height: 48px; v-text-anchor: middle; width: 240px;" arcsize="50%" stroke="f" fillcolor="${emailColors.ink}">
        <w:anchorlock/>
        <center style="color: #ffffff; font-family: Arial, sans-serif; font-size: 15px; font-weight: bold;">${label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${href}" style="display: inline-block; padding: 14px 26px; font-family: ${SANS}; font-size: 15px; line-height: 20px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 9999px; background-color: ${emailColors.ink};">${label}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

export type ListItem = { title?: string; text?: string; href?: string; linkLabel?: string };

// Items with a small iris check, like the plan lists on the pricing page.
export function checkList(items: ListItem[]) {
  const rows = items
    .map(
      (item) => `<tr>
    <td valign="top" width="30" style="padding: 2px 12px 14px 0;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse: separate;">
        <tr>
          <td class="email-check" align="center" valign="middle" width="22" height="22" style="width: 22px; height: 22px; border-radius: 11px; background-color: ${emailColors.irisSoft}; color: ${emailColors.irisInk}; font-family: Arial, sans-serif; font-size: 12px; line-height: 22px; font-weight: 700;">&#10003;</td>
        </tr>
      </table>
    </td>
    <td valign="top" style="padding: 0 0 14px 0; ${bodyText} font-size: 15px; line-height: 25px;">
      ${[item.title ? `<span style="font-weight: 600; color: ${emailColors.ink};">${item.title}</span>` : "", item.text ?? ""].filter(Boolean).join(" ")}${
        item.href && item.linkLabel ? ` ${link(item.href, item.linkLabel)}` : ""
      }
    </td>
  </tr>`,
    )
    .join("\n");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 2px 0 8px 0;">
${rows}
</table>`;
}

// A quiet box for a side note.
export function note(html: string) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 6px 0 22px 0; border-collapse: separate; border-radius: 14px; background-color: ${emailColors.paper};">
  <tr>
    <td style="padding: 16px 18px; ${bodyText} font-size: 15px; line-height: 24px;">${html}</td>
  </tr>
</table>`;
}

export function signature({ name, role }: { name: string; role: string }) {
  return `<p style="margin: 26px 0 0 0; ${bodyText}">
  <span style="display: block; font-weight: 600; color: ${emailColors.ink};">${name}</span>
  <span style="display: block; font-size: 14px; line-height: 22px; color: ${emailColors.muted};">${role}</span>
</p>`;
}

// The shell: the wordmark, a card with the content, and a short footer saying
// why it was sent and who sent it. Images load from the public site, so they
// show in inboxes even when the email was sent from a local copy.
export function renderEmailLayout({
  title,
  preheader,
  content,
  reason,
}: {
  // The document title, usually the subject.
  title: string;
  // The inbox preview next to the subject. Hidden in the email itself.
  preheader: string;
  // Body HTML from the helpers above.
  content: string;
  // One sentence on why they got this email.
  reason: string;
}) {
  const site = BRAND.siteUrl.replace(/\/$/, "");
  const siteName = site.replace(/^https?:\/\//, "");
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
  <!--[if mso]>
  <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  <![endif]-->
  <!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600&family=Funnel+Display:wght@600&display=swap" rel="stylesheet">
  <!--<![endif]-->
  <style>
    body { margin: 0; padding: 0; background-color: ${emailColors.paper}; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: separate; border-spacing: 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a { color: ${emailColors.irisInk}; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; }
      .email-content { padding: 30px 22px !important; }
      .email-header, .email-footer { padding-left: 6px !important; padding-right: 6px !important; }
      .email-button a { display: block !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${emailColors.paper};">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: ${emailColors.paper}; opacity: 0;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${emailColors.paper};">
    <tr>
      <td align="center" style="padding: 36px 16px 44px 16px;">
        <!--[if mso]>
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td>
        <![endif]-->
        <table role="presentation" class="email-container" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; margin: 0 auto;">
          <tr>
            <td class="email-header" style="padding: 0 10px 22px 10px;">
              <a href="${site}" style="display: inline-block; text-decoration: none;">
                <img src="${site}/email/wordmark.png" width="88" height="34" alt="${BRAND.name}" style="display: block; width: 88px; height: 34px; border: 0;">
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: separate; border: 1px solid ${emailColors.line}; border-radius: 20px; background-color: ${emailColors.card};">
                <tr>
                  <td class="email-content" style="padding: 42px 44px; ${bodyText}">
${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-footer" style="padding: 24px 10px 0 10px; font-family: ${SANS}; font-size: 13px; line-height: 20px; color: ${emailColors.muted};">
              <p style="margin: 0 0 6px 0;">${reason}</p>
              <p style="margin: 0 0 6px 0;">Questions? Reply to this email or write to <a href="mailto:${LEGAL.email}" style="color: ${emailColors.muted}; text-decoration: underline;">${LEGAL.email}</a>.</p>
              <p style="margin: 0;">${LEGAL.company}, ${LEGAL.address} &middot; <a href="${site}" style="color: ${emailColors.muted}; text-decoration: underline;">${siteName}</a></p>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// The plain-text part of the email, from its HTML. It helps delivery and
// covers mail apps that don't show HTML.
export function emailTextFromHtml(html: string) {
  return html
    .replace(/<head>[\s\S]*?<\/head>/i, "")
    // A list's check marks become dashes on the item's line.
    .replace(/<table[^>]*>\s*<tr>\s*<td class="email-check"[\s\S]*?<\/table>\s*<\/td>\s*<td[^>]*>\s*/gi, "- ")
    .replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<div style="display: none[\s\S]*?<\/div>/i, "")
    .replace(/<td class="email-header"[\s\S]*?<\/td>/i, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, text: string) =>
      text.trim() && !href.startsWith("mailto:") && text.trim() !== href ? `${text.trim()} (${href})` : text.trim(),
    )
    .replace(/<\/(p|h1|h2|tr|div|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&zwnj;/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&#10003;/g, "✓")
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.replace(/\s{2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
