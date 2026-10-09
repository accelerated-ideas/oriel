// The product's name. Everything user-facing reads from here, so a fork
// renames it in one place (plus the embed snippet its customers paste).
export const BRAND = {
  name: "Oriel",
  tagline: "Give your product a voice",
  // Global the embed script exposes on customer sites: window.Oriel(...)
  embedGlobal: "Oriel",
  // Prefix for postMessage events between the host page and the widget iframe.
  messagePrefix: "oriel",
  // The product's website, linked from "Powered by Oriel" in the widget.
  siteUrl: "https://useoriel.com",
  // The public source code.
  repoUrl: "https://github.com/accelerated-ideas/oriel",
} as const;

export function appUrl(path = "") {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3010").replace(/\/$/, "");
  return `${base}${path}`;
}
