import type { Metadata } from "next";
import { EB_Garamond, Figtree, Funnel_Display, Geist_Mono } from "next/font/google";
import { appUrl, BRAND } from "@/config/brand";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
// The brand face: the logo, and headlines on the marketing site.
const funnel = Funnel_Display({ subsets: ["latin"], variable: "--font-funnel" });
const garamond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-garamond",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  // Absolute addresses (link previews, canonical links) start here.
  metadataBase: new URL(appUrl()),
  applicationName: BRAND.name,
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description:
    "A voice-first AI agent that lives inside your product. It answers questions, guides people around your app, takes actions for them, and tells you what they struggle with.",
  // Kept out of search: the dashboard, sign-in, invitations and the widget's
  // frame. The public site (app/(web)) opts back in.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${figtree.variable} ${geistMono.variable} ${garamond.variable} ${funnel.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
