import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/get-user";
import { isGoogleSignInEnabled } from "@/lib/auth/google";
import { safeNextPath } from "@/lib/utils";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "./auth-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  google_cancelled: "Google sign-in was cancelled. Try again, or use your email.",
  google_failed: "We couldn't sign you in with Google. Try again, or use your email.",
};

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string; error?: string }>;
}) {
  const { next, email, error } = await searchParams;
  const destination = safeNextPath(next) ?? "/account";
  const user = await getUser();
  if (user) redirect(destination);
  return (
    <AuthShell>
      <AuthForm
        next={destination}
        initialEmail={typeof email === "string" ? email.slice(0, 200) : ""}
        google={await isGoogleSignInEnabled()}
        initialError={typeof error === "string" ? (ERRORS[error] ?? null) : null}
      />
    </AuthShell>
  );
}
