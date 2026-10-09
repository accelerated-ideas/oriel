// Google Analytics: on the marketing site after consent, and in the dashboard
// for everyone signed in (src/components/consent). Unset, the site has no
// optional cookies, so no banner either. It's read at build time.
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
const ID_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
// A Google Analytics 4 measurement ID looks like G-ZLMT1JLX6M.
export const ANALYTICS_ENABLED =
  GA_MEASUREMENT_ID.startsWith("G-") &&
  GA_MEASUREMENT_ID.length > 2 &&
  [...GA_MEASUREMENT_ID.slice(2).toUpperCase()].every((character) => ID_CHARACTERS.includes(character));

// How long Google Analytics' cookies last: 13 months, the most EU regulators accept.
export const ANALYTICS_COOKIE_DAYS = 395;

// PostHog: product analytics and session recordings in the dashboard, for
// everyone signed in (src/components/dashboard/product-analytics.tsx). Hosted
// edition only, and only when the project token is set (read at build time).
export const POSTHOG_TOKEN = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() ?? "";
export const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://eu.i.posthog.com";
