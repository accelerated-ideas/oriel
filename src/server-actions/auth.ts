"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth/get-user";
import { isReviewAccount } from "@/lib/auth/review";
import { welcomeNewUser } from "@/lib/emails/welcome";
import { notifyEvent } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseServer } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { safeNextPath } from "@/lib/utils";

// Right after signing in with a code: welcomes someone new, once. Runs after
// the response, so it never slows the way in.
export async function actionSignedIn() {
  const user = await getUser();
  if (user) after(() => welcomeNewUser(user, "email code"));
}

// Signs out. With `next` (and `email`) in the form, goes back to sign-in set
// up to continue there, e.g. to accept an invitation as someone else.
export async function actionSignOut(formData?: FormData) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  const next = safeNextPath(formData?.get("next"));
  const email = formData?.get("email");
  const query = new URLSearchParams();
  if (next) query.set("next", next);
  if (typeof email === "string" && email) query.set("email", email);
  redirect(query.size > 0 ? `/auth?${query}` : "/auth");
}

const reviewSignInSchema = z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200) });

// The review sign-in (/auth/review, src/lib/auth/review.ts). Only the review
// accounts can use it; any other email gets the same answer as a wrong
// password, so the list can't be probed.
export async function actionReviewSignIn(input: z.input<typeof reviewSignInSchema>): Promise<ActionResult> {
  const mismatch = { ok: false as const, error: "That email and password don't match." };
  const parsed = reviewSignInSchema.safeParse(input);
  if (!parsed.success) return mismatch;
  const address = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await rateLimit(`review-sign-in:${address}`, 10, "10 m"))) {
    return { ok: false, error: "Too many tries. Wait a few minutes, then try again." };
  }
  if (!isReviewAccount(parsed.data.email)) return mismatch;

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
  });
  if (error || !data.user) return mismatch;
  const userId = data.user.id;
  after(() => notifyEvent("🔑 The review account signed in", { user: userId }));
  return { ok: true };
}
