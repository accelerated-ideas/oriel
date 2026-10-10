import "server-only";

// Accounts that sign in with an email and password at /auth/review, for an
// app marketplace's reviewers (REVIEW_ACCOUNT_EMAILS, comma-separated). Their
// users are created with a password in Supabase Auth; everyone else signs in
// with a code or Google, and has no password to sign in with.
export function reviewAccountEmails() {
  return (process.env.REVIEW_ACCOUNT_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isReviewAccount(email: string) {
  return reviewAccountEmails().includes(email.trim().toLowerCase());
}
