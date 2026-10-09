// Which edition this install is.
//   self-hosted  The default. The open-source app with every feature and no
//                plans, limits or billing. `/` goes straight to the dashboard.
//   cloud        Our hosted service: plans, limits and Stripe billing
//                (src/config/plans.ts), plus the marketing site.
// NEXT_PUBLIC_ so client components can read it; it's fixed at build time.
export type Edition = "self-hosted" | "cloud";

export const EDITION: Edition = process.env.NEXT_PUBLIC_EDITION === "cloud" ? "cloud" : "self-hosted";

export const IS_CLOUD = EDITION === "cloud";
