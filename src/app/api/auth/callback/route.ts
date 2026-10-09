import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/utils";

// Where people land after signing in with Google (through Supabase Auth): the
// code becomes a session, then they go on to where they were headed. A new
// account gets its profile from the auth trigger, like an email sign-up.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next")) ?? "/account";

  const backToSignIn = (error: "google_cancelled" | "google_failed") => {
    const target = new URL("/auth", url.origin);
    target.searchParams.set("error", error);
    if (next !== "/account") target.searchParams.set("next", next);
    return NextResponse.redirect(target);
  };

  // They backed out on Google's page, or Google turned the sign-in down.
  const providerError = url.searchParams.get("error");
  if (providerError) return backToSignIn(providerError === "access_denied" ? "google_cancelled" : "google_failed");

  const code = url.searchParams.get("code");
  if (!code) return backToSignIn("google_failed");

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("Google sign-in failed", error);
    return backToSignIn("google_failed");
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
