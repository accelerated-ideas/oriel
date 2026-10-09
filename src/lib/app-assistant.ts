import "server-only";
import { SignJWT } from "jose";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

// The app's own help assistant (scripts/app-assistant.ts), on every dashboard page.
export const APP_ASSISTANT_ID = process.env.NEXT_PUBLIC_APP_ASSISTANT_ID || null;

// Identifies the signed-in user to the help assistant, the same way a
// customer's site identifies its users (src/lib/identity.ts).
export async function appAssistantToken(user: User) {
  if (!APP_ASSISTANT_ID) return null;
  const { data } = await supabaseAdmin.from("agents").select("identity_secret").eq("id", APP_ASSISTANT_ID).maybeSingle();
  if (!data?.identity_secret) return null;
  return new SignJWT({ email: user.email ?? undefined })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(new TextEncoder().encode(data.identity_secret));
}
