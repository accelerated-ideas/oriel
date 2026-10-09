// Google Analytics: on the marketing site after consent, and in the dashboard
// without cookies until people choose (src/components/consent). Unset, there
// are no optional cookies, so no banner either. It's read at build time.
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
const ID_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
// A Google Analytics 4 measurement ID looks like G-ZLMT1JLX6M.
export const ANALYTICS_ENABLED =
  GA_MEASUREMENT_ID.startsWith("G-") &&
  GA_MEASUREMENT_ID.length > 2 &&
  [...GA_MEASUREMENT_ID.slice(2).toUpperCase()].every((character) => ID_CHARACTERS.includes(character));

// How long Google Analytics' cookies last: 13 months, the most EU regulators accept.
export const ANALYTICS_COOKIE_DAYS = 395;
