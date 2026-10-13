import "server-only";
import { cookies } from "next/headers";
import { after } from "next/server";
import { ANALYTICS_ENABLED, SIGN_UP_COOKIE } from "@/config/analytics";
import { claimWelcome, welcomeNewUser } from "@/lib/emails/welcome";

// Right after a sign-in. Someone signing in for the first time has just signed
// up: the browser is told to report it to Google Analytics (src/components/consent/analytics.tsx),
// and they're welcomed after the response.
export async function onSignIn(user: { id: string; email?: string | null }, via: "email code" | "Google") {
  if (!(await claimWelcome(user.id))) return;
  if (ANALYTICS_ENABLED) {
    (await cookies()).set(SIGN_UP_COOKIE, via === "Google" ? "Google" : "Email", {
      path: "/",
      maxAge: 60 * 60,
      sameSite: "lax",
    });
  }
  after(() => welcomeNewUser(user, via));
}
