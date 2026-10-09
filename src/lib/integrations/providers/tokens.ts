import "server-only";
import { createHash, createHmac } from "node:crypto";
import { loadConnection, updateSecret, type Connection, type StoredProvider } from "../store";

// Access tokens that expire (Zendesk, Salesforce, HubSpot, Calendly, Stripe): refreshed
// shortly before they run out. Some services invalidate the old refresh token
// on every refresh, so refreshes for one connection run one at a time, and a
// failed refresh first checks whether another server already got new tokens.

export type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number };

const MARGIN_MS = 60_000;
const refreshing = new Map<string, Promise<string>>();

export function secretFrom(token: TokenResponse, previous?: Connection["secret"]): Connection["secret"] {
  return {
    ...previous,
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? (previous?.refresh_token as string | undefined),
    expires_at: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
    // When the tokens last changed, for keeping rarely used connections alive (../keep-alive.ts).
    refreshed_at: Date.now(),
  };
}

export async function accessToken(connection: Connection<StoredProvider>, refresh: (refreshToken: string) => Promise<TokenResponse>) {
  const expiresAt = Number(connection.secret.expires_at ?? 0);
  if (!expiresAt || expiresAt - MARGIN_MS > Date.now()) return String(connection.secret.access_token);

  const running = refreshing.get(connection.id);
  if (running) return running;
  const job = (async () => {
    const refreshToken = String(connection.secret.refresh_token ?? "");
    if (!refreshToken) throw new Error("The connection has expired. Connect it again on the Integrations page.");
    try {
      const token = await refresh(refreshToken);
      await updateSecret(connection, secretFrom(token, connection.secret));
      return token.access_token;
    } catch (error) {
      const latest = await loadConnection(connection.agentId, connection.provider);
      if (latest && latest.secret.refresh_token !== refreshToken && Number(latest.secret.expires_at ?? 0) > Date.now()) {
        connection.secret = latest.secret;
        return String(latest.secret.access_token);
      }
      throw new Error(`The connection has expired. Connect it again on the Integrations page. (${(error as Error).message})`);
    }
  })();
  refreshing.set(connection.id, job);
  try {
    return await job;
  } finally {
    refreshing.delete(connection.id);
  }
}

// PKCE for services that require it (Calendly). The verifier comes from the
// signed state and a server secret, so nothing is stored between the redirect
// and the callback, and it never appears in a URL.
export function pkce(state: string) {
  const verifier = createHmac("sha256", process.env.ENCRYPTION_KEY ?? process.env.WIDGET_SESSION_SECRET ?? "")
    .update(`pkce:${state}`)
    .digest("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}
