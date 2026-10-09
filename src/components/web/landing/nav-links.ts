// Shared by the header (a client component) and the footer (server-rendered).
// Sections of the landing page start with "/#", so they work from any page.
// Footer-only links don't show in the header.
const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#open-source", label: "Open source", footerOnly: true },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

export const FOOTER_LINKS = LINKS;
export const NAV_LINKS = LINKS.filter((link) => !link.footerOnly);
