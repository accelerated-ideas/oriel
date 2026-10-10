import { REPO_HREF, REPO_URL } from "./repo";

// Shared by the header (a client component) and the footer (server-rendered).
// Sections of the landing page start with "/#", so they work from any page.
// Footer-only links don't show in the header; external ones open in a new tab.
const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: REPO_HREF, label: "Open source", footerOnly: true, external: Boolean(REPO_URL) },
  { href: "/pricing", label: "Pricing" },
  { href: "/integrations", label: "Integrations", footerOnly: true },
  { href: "/#faq", label: "FAQ" },
];

export const FOOTER_LINKS = LINKS;
export const NAV_LINKS = LINKS.filter((link) => !link.footerOnly);
