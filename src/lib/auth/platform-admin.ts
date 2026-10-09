import "server-only";

// People who run the platform (not customers): they can see what everything costs us.
export function isPlatformAdmin(email: string | null | undefined) {
  if (!email) return false;
  const admins = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}
