import "server-only";
import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";

// Once per request: layouts, pages and guards all ask.
export const getUser = cache(async () => {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
});
