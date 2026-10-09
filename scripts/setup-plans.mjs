// The hosted service's plans (src/config/subscription-plans.ts) aren't in the
// public repository. Runs after `npm install`:
// - With SUBSCRIPTION_PLANS_BASE64 (the file, base64-encoded), writes the file
//   from it. That's how a hosted build from Git gets the real plans.
// - Otherwise, if the file is missing, copies subscription-plans.example.ts.
//   A cloud-edition build on a server fails instead, so it never sells the
//   example plans.
import { copyFileSync, existsSync, writeFileSync } from "node:fs";

const PLANS = "src/config/subscription-plans.ts";
const EXAMPLE = "src/config/subscription-plans.example.ts";

if (process.env.SUBSCRIPTION_PLANS_BASE64) {
  writeFileSync(PLANS, Buffer.from(process.env.SUBSCRIPTION_PLANS_BASE64, "base64"));
  console.log(`Wrote ${PLANS} from SUBSCRIPTION_PLANS_BASE64.`);
} else if (!existsSync(PLANS)) {
  const hostedBuild = process.env.NEXT_PUBLIC_EDITION === "cloud" && Boolean(process.env.VERCEL || process.env.CI);
  if (hostedBuild) {
    console.error(`${PLANS} is missing. Set SUBSCRIPTION_PLANS_BASE64 to the file, base64-encoded (README, "Editions").`);
    process.exit(1);
  }
  copyFileSync(EXAMPLE, PLANS);
  console.log(`Created ${PLANS} from the example. Edit it to set your own plans.`);
}
