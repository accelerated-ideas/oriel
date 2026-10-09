import "server-only";

// Whether Google sign-in is switched on in Supabase Auth (its Google provider,
// set up in the Supabase dashboard, or supabase/config.toml locally). The
// sign-in page only offers Google when it is, so installs without it don't
// show a button that fails.
export async function isGoogleSignInEnabled() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "" },
      next: { revalidate: 300 },
    });
    if (!response.ok) return false;
    const settings = (await response.json()) as { external?: Record<string, boolean> };
    return Boolean(settings.external?.google);
  } catch {
    return false;
  }
}
