"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAgent } from "@/lib/auth/access";
import { addCapabilities, removeCapabilities, setCapabilityProvider } from "@/lib/integrations/actions";
import { CAPABILITIES, type Capability } from "@/lib/integrations/capabilities";
import { isProviderId, providerInfo, type ProviderId } from "@/lib/integrations/catalog";
import { adapterFor } from "@/lib/integrations/providers";
import type { Setting } from "@/lib/integrations/providers/types";
import { deleteConnection, loadConnection, loadConnections, saveConnection, updateConfig } from "@/lib/integrations/store";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

function integrationsPath(organizationId: string, agentId: string) {
  return `/account/${organizationId}/agents/${agentId}/integrations`;
}

// Connects a service from values pasted on the Integrations page (an API key).
export async function actionConnectIntegration(agentId: string, provider: string, values: Record<string, string>): Promise<ActionResult> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  if (!isProviderId(provider)) return { ok: false, error: "Unknown integration." };
  const adapter = adapterFor(provider);
  if (!adapter.connectWithToken) return { ok: false, error: `${providerInfo(provider).name} connects with its own button.` };
  try {
    const connected = await adapter.connectWithToken(values);
    await saveConnection({ agentId, organizationId: access.agent.organization_id, provider, ...connected });
    await addCapabilities(agentId, access.agent.organization_id, provider);
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
  revalidatePath(integrationsPath(access.agent.organization_id, agentId));
  return { ok: true };
}

export async function actionDisconnectIntegration(agentId: string, provider: string): Promise<ActionResult> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  if (!isProviderId(provider)) return { ok: false, error: "Unknown integration." };
  const connection = await loadConnection(agentId, provider);
  if (connection) await adapterFor(provider).revoke?.(connection);
  await deleteConnection(agentId, provider);
  const remaining = (await loadConnections(agentId)).map((other) => other.provider);
  await removeCapabilities(agentId, provider, remaining);
  revalidatePath(integrationsPath(access.agent.organization_id, agentId));
  return { ok: true };
}

// The choices for a connection's settings (channels, event types…), loaded from the service.
export async function actionIntegrationSettings(agentId: string, provider: string): Promise<ActionResult<{ settings: Setting[] }>> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  if (!isProviderId(provider)) return { ok: false, error: "Unknown integration." };
  const connection = await loadConnection(agentId, provider);
  if (!connection) return { ok: false, error: "Not connected." };
  try {
    return { ok: true, data: { settings: (await adapterFor(provider).settings?.(connection)) ?? [] } };
  } catch (error) {
    return { ok: false, error: `Couldn't load settings from ${providerInfo(provider).name}: ${errorMessage(error)}` };
  }
}

// Switches the owner can flip without asking the service (post follow-ups to Slack).
const SWITCHES: Partial<Record<ProviderId, string[]>> = { slack: ["post_handoffs"] };

const saveSchema = z.object({
  config: z.record(z.string(), z.union([z.string(), z.boolean()])),
  actions: z.array(z.object({ id: z.string().uuid(), enabled: z.boolean(), requires_confirmation: z.boolean() })).max(20),
});

// Saves a Configure drawer at once: the setting choices (only values the
// service offers, so nothing can point the assistant elsewhere) and its jobs.
export async function actionSaveIntegration(
  agentId: string,
  provider: string,
  changes: z.input<typeof saveSchema>,
): Promise<ActionResult> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  if (!isProviderId(provider)) return { ok: false, error: "Unknown integration." };
  const parsed = saveSchema.safeParse(changes);
  if (!parsed.success) return { ok: false, error: "Couldn't save those changes." };
  const connection = await loadConnection(agentId, provider);
  if (!connection) return { ok: false, error: "Not connected." };

  const entries = Object.entries(parsed.data.config);
  if (entries.length > 0) {
    const config = { ...connection.config };
    const choices = entries.some(([, value]) => typeof value === "string")
      ? ((await adapterFor(provider).settings?.(connection)) ?? [])
      : [];
    for (const [key, value] of entries) {
      if (typeof value === "boolean") {
        if (!SWITCHES[provider]?.includes(key)) return { ok: false, error: "Unknown setting." };
        config[key] = value;
      } else {
        const option = choices.find((setting) => setting.key === key)?.options.find((candidate) => candidate.value === value);
        if (!option) return { ok: false, error: "That choice isn't available anymore." };
        // The label shows on the card without asking the service again.
        config[key] = value;
        config[`${key}_label`] = option.label;
      }
    }
    await updateConfig(connection, config);
  }

  for (const action of parsed.data.actions) {
    await supabaseAdmin
      .from("actions")
      .update({ enabled: action.enabled, requires_confirmation: action.requires_confirmation, updated_at: new Date().toISOString() })
      .eq("id", action.id)
      .eq("agent_id", agentId)
      .eq("kind", "integration")
      .throwOnError();
  }
  revalidatePath(integrationsPath(access.agent.organization_id, agentId));
  return { ok: true };
}

// A harmless test in the service (a Slack message, a Zendesk ticket).
export async function actionTestIntegration(agentId: string, provider: string): Promise<ActionResult<{ note: string; url?: string }>> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  if (!isProviderId(provider)) return { ok: false, error: "Unknown integration." };
  const adapter = adapterFor(provider);
  const connection = await loadConnection(agentId, provider);
  if (!connection || !adapter.test) return { ok: false, error: "Nothing to test." };
  try {
    return { ok: true, data: await adapter.test(connection, { assistantName: access.agent.assistant_name }) };
  } catch (error) {
    return { ok: false, error: `${providerInfo(provider).name} said: ${errorMessage(error)}` };
  }
}

// Which connected service handles a capability, when more than one could.
export async function actionUseIntegrationFor(agentId: string, capability: string, provider: string): Promise<ActionResult> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  if (!isProviderId(provider) || !(capability in CAPABILITIES)) return { ok: false, error: "Unknown integration." };
  if (!providerInfo(provider).capabilities.includes(capability as Capability)) {
    return { ok: false, error: `${providerInfo(provider).name} can't do that.` };
  }
  if (!(await loadConnection(agentId, provider))) return { ok: false, error: `Connect ${providerInfo(provider).name} first.` };
  await setCapabilityProvider(agentId, capability as Capability, provider);
  revalidatePath(integrationsPath(access.agent.organization_id, agentId));
  return { ok: true };
}

// Connecting with the customer's own app (Zendesk, Salesforce): keeps its
// credentials encrypted as a pending connection, then returns where to start OAuth.
export async function actionPrepareOwnApp(
  agentId: string,
  provider: string,
  values: Record<string, string>,
): Promise<ActionResult<{ url: string }>> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  if (!isProviderId(provider)) return { ok: false, error: "Unknown integration." };
  const adapter = adapterFor(provider);
  if (!adapter.prepareOwnApp) return { ok: false, error: "This integration doesn't take its own app." };
  const clientId = (values.client_id ?? "").trim();
  const clientSecret = (values.client_secret ?? "").trim();
  if (!clientId || !clientSecret) return { ok: false, error: "Paste both credentials from your app." };
  let metadata: Record<string, unknown>;
  try {
    metadata = adapter.prepareOwnApp(values);
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
  await saveConnection({
    agentId,
    organizationId: access.agent.organization_id,
    provider,
    secret: { client_id: clientId, client_secret: clientSecret },
    metadata: { ...metadata, pending: true },
    config: {},
  });
  return { ok: true, data: { url: `/api/integrations/${provider}/connect?${new URLSearchParams({ agentId })}` } };
}
