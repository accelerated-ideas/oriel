import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isProviderId } from "./catalog";
import { adapterFor } from "./providers";
import { loadConnection } from "./store";
import { loadStripeConnection, stripeApiKey } from "./stripe";

// Some refresh tokens die when they go unused: Zendesk's after 90 days, a
// Stripe app's after a year, Cal.com's after a time it doesn't say. The daily
// worker refreshes connections that haven't refreshed for a month, so an
// assistant that rarely uses one stays connected. Services opt in with the
// adapter's keepAlive.

const EVERY_MS = 30 * 24 * 60 * 60 * 1000;

const fresh = (secret: Record<string, unknown>) => Number(secret.refreshed_at ?? 0) > Date.now() - EVERY_MS;

export async function keepConnectionsAlive() {
  const { data } = await supabaseAdmin.from("integrations").select("agent_id, provider");
  for (const row of data ?? []) {
    try {
      if (row.provider === "stripe") {
        const connection = await loadStripeConnection(row.agent_id);
        if (!connection || connection.secret.via !== "app" || fresh(connection.secret)) continue;
        // Treat the access token as expired, so getting a key refreshes it.
        connection.secret = { ...connection.secret, expires_at: 1 };
        await stripeApiKey(connection);
      } else if (isProviderId(row.provider) && adapterFor(row.provider).keepAlive) {
        const connection = await loadConnection(row.agent_id, row.provider);
        if (!connection || connection.metadata.pending || !connection.secret.refresh_token || fresh(connection.secret)) continue;
        await adapterFor(row.provider).keepAlive!(connection);
      }
    } catch (error) {
      console.error(`Couldn't keep the ${row.provider} connection of assistant ${row.agent_id} alive`, error);
    }
  }
}
