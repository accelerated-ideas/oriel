"use client";
import { useEffect } from "react";
import type { PostHog } from "posthog-js";
import { POSTHOG_HOST, POSTHOG_TOKEN } from "@/config/analytics";
import { IS_CLOUD } from "@/config/edition";
import { supabaseClient } from "@/lib/supabase/client";

// PostHog in the dashboard: product analytics and session recordings for
// everyone signed in. It loads after the page, and never on the website or in
// the widget. People are known by their user id, never their email.
// Recordings mask every input and the text inside `ph-mask` (visitors'
// conversations, insights, emails); `ph-no-capture` leaves an element out.
const ENABLED = IS_CLOUD && POSTHOG_TOKEN.startsWith("phc_");

let loading: Promise<PostHog> | null = null;

function load() {
  loading ??= import("posthog-js").then(({ default: posthog }) => {
    posthog.init(POSTHOG_TOKEN, {
      api_host: POSTHOG_HOST,
      defaults: "2026-08-30",
      person_profiles: "identified_only",
      persistence: "localStorage+cookie",
      disable_surveys: true,
      session_recording: { maskAllInputs: true, maskTextClass: "ph-mask" },
    });
    return posthog;
  });
  return loading;
}

export function ProductAnalytics() {
  useEffect(() => {
    if (!ENABLED) return;
    let cancelled = false;
    void (async () => {
      const posthog = await load();
      const { data } = await supabaseClient().auth.getSession();
      const userId = data.session?.user.id;
      if (!cancelled && userId && posthog.get_distinct_id() !== userId) posthog.identify(userId);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}

// Signing out: whoever uses this browser next starts fresh.
export async function forgetProductAnalyticsUser() {
  if (loading) (await loading).reset();
}
