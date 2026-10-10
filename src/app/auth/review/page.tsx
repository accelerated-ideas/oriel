import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth/get-user";
import { reviewAccountEmails } from "@/lib/auth/review";
import { AuthShell } from "@/components/auth/auth-shell";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Sign in" };

// Email and password sign-in for app marketplace reviewers, linked from
// nowhere. Without REVIEW_ACCOUNT_EMAILS the page doesn't exist.
export default async function ReviewSignInPage() {
  if (reviewAccountEmails().length === 0) notFound();
  if (await getUser()) redirect("/account");
  return (
    <AuthShell>
      <ReviewForm />
    </AuthShell>
  );
}
