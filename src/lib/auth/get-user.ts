import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

export async function getUser() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}
