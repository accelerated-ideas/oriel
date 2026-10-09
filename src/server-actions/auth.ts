"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/utils";

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
