import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ProviderId } from "./catalog";

// Connections to the services in src/lib/integrations/providers, one per
// assistant and service. Tokens are stored encrypted as JSON; `metadata` is
// what the service told us about the account; `config` is what the owner chose
// (a channel, an event type).

export type { ProviderId };

// Stripe is stored here too, but connected and used through ./stripe.ts.
export type StoredProvider = ProviderId | "stripe";

export type Connection<P extends StoredProvider = ProviderId> = {
  id: string;
  agentId: string;
  organizationId: string;
  provider: P;
  secret: Record<string, string | number | undefined>;
  metadata: Record<string, unknown>;
  config: Record<string, unknown>;
};

type Row = {
  id: string;
  agent_id: string;
  organization_id: string;
  provider: StoredProvider;
  secret_encrypted: string;
  metadata: Record<string, unknown> | null;
  config: Record<string, unknown> | null;
};

function fromRow<P extends StoredProvider>(row: Row): Connection<P> {
  return {
    id: row.id,
    agentId: row.agent_id,
    organizationId: row.organization_id,
    provider: row.provider as P,
    secret: JSON.parse(decryptSecret(row.secret_encrypted)),
    metadata: row.metadata ?? {},
    config: row.config ?? {},
  };
}

const COLUMNS = "id, agent_id, organization_id, provider, secret_encrypted, metadata, config";

export async function loadConnection<P extends StoredProvider>(agentId: string, provider: P): Promise<Connection<P> | null> {
  const { data } = await supabaseAdmin.from("integrations").select(COLUMNS).eq("agent_id", agentId).eq("provider", provider).maybeSingle();
  return data ? fromRow<P>(data as Row) : null;
}

export async function loadConnections(agentId: string) {
  const { data } = await supabaseAdmin.from("integrations").select(COLUMNS).eq("agent_id", agentId).neq("provider", "stripe");
  const connections: Connection[] = [];
  for (const row of (data ?? []) as Row[]) {
    // Waiting for the customer to finish connecting (their own Salesforce app).
    if (row.metadata?.pending) continue;
    try {
      connections.push(fromRow<ProviderId>(row));
    } catch (error) {
      // A secret that no longer decrypts (ENCRYPTION_KEY changed) is treated as not connected.
      console.error(`Couldn't read the ${row.provider} connection`, error);
    }
  }
  return connections;
}

export async function saveConnection(input: {
  agentId: string;
  organizationId: string;
  provider: ProviderId;
  secret: Connection["secret"];
  metadata: Connection["metadata"];
  config?: Connection["config"];
}) {
  const { data } = await supabaseAdmin
    .from("integrations")
    .upsert(
      {
        agent_id: input.agentId,
        organization_id: input.organizationId,
        provider: input.provider,
        secret_encrypted: encryptSecret(JSON.stringify(input.secret)),
        metadata: input.metadata,
        ...(input.config && { config: input.config }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agent_id,provider" },
    )
    .select(COLUMNS)
    .single()
    .throwOnError();
  return fromRow(data as Row);
}

// New tokens after a refresh.
export async function updateSecret(connection: Connection<StoredProvider>, secret: Connection["secret"]) {
  connection.secret = secret;
  await supabaseAdmin
    .from("integrations")
    .update({ secret_encrypted: encryptSecret(JSON.stringify(secret)), updated_at: new Date().toISOString() })
    .eq("id", connection.id);
}

export async function updateConfig(connection: Connection<StoredProvider>, config: Connection["config"]) {
  connection.config = config;
  await supabaseAdmin.from("integrations").update({ config, updated_at: new Date().toISOString() }).eq("id", connection.id).throwOnError();
}

export async function deleteConnection(agentId: string, provider: ProviderId) {
  await supabaseAdmin.from("integrations").delete().eq("agent_id", agentId).eq("provider", provider);
}

// ---------- calling providers ----------

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// JSON over HTTPS with a timeout. Errors carry the provider's own message.
export async function callProvider<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 12_000, ...rest } = init;
  const response = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) throw new ProviderError(errorText(body) || `${response.status} ${response.statusText}`, response.status);
  return body as T;
}

// The readable part of the error shapes these services use.
function errorText(body: unknown): string {
  if (!body) return "";
  if (typeof body === "string") return body.slice(0, 300);
  if (Array.isArray(body)) return body.map(errorText).filter(Boolean).join("; ");
  const record = body as Record<string, unknown>;
  // Salesforce and others put a machine-readable code beside the message.
  const code = typeof record.errorCode === "string" ? record.errorCode : null;
  if (code && typeof record.message === "string") return `${code}: ${record.message}`.slice(0, 300);
  for (const key of ["message", "error_description", "description", "error", "title", "details"]) {
    const value = record[key];
    if (typeof value === "string" && value) return value.slice(0, 300);
    if (value && typeof value === "object") {
      const nested = errorText(value);
      if (nested) return nested;
    }
  }
  return "";
}
