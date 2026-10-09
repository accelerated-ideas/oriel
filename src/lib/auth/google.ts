import "server-only";

// Whether Google sign-in is switched on in Supabase Auth (its Google provider,
// set up in the Supabase dashboard, or supabase/config.toml locally). The
// sign-in page only offers Google when it is, so installs without it don't
// show a button that fails.
//
// Asked fresh, never from Next's shared fetch cache: that kept an old "off"
// after Google was switched on. Each server remembers a successful answer for
// five minutes; a failed check isn't remembered, so the next visit asks again.
const REMEMBER_MS = 5 * 60_000;
let remembered: { enabled: boolean; at: number } | null = null;

export async function isGoogleSignInEnabled() {
  if (remembered && Date.now() - remembered.at < REMEMBER_MS) return remembered.enabled;
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error("Couldn't read Supabase Auth settings", response.status, (await response.text()).slice(0, 300));
      return false;
    }
    const settings = (await response.json()) as { external?: Record<string, boolean> };
    remembered = { enabled: Boolean(settings.external?.google), at: Date.now() };
    return remembered.enabled;
  } catch (error) {
    console.error("Couldn't read Supabase Auth settings", error);
    return false;
  }
}
