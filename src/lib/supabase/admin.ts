import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client. All data access goes through here; authorization is
// enforced in application code (see src/lib/auth).
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || "",
  { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
);
