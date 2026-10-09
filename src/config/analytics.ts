// Google Analytics for the marketing site (hosted edition only). Unset, there
// are no optional cookies, so no banner either. It's read at build time.
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
export const ANALYTICS_ENABLED = /^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID);

// How long Google Analytics' cookies last: 13 months, the most EU regulators accept.
export const ANALYTICS_COOKIE_DAYS = 395;
