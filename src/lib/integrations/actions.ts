import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CAPABILITIES, type Capability } from "./capabilities";
import { providerInfo, type ProviderId } from "./catalog";

// Keeps an assistant's integration actions in step with its connections: one
// action per capability, handled by one connected service. Connecting a
// service adds the capabilities nobody handles yet; disconnecting hands its
// capabilities to another connected service that can do them, or removes them.

type IntegrationAction = { id: string; config: { capability?: Capability; provider?: ProviderId } };

async function integrationActions(agentId: string) {
  const { data } = await supabaseAdmin.from("actions").select("id, config").eq("agent_id", agentId).eq("kind", "integration");
  return (data ?? []) as IntegrationAction[];
}

export async function addCapabilities(agentId: string, organizationId: string, provider: ProviderId) {
  const existing = await integrationActions(agentId);
  const handled = new Set(existing.map((action) => action.config.capability));
  const rows = providerInfo(provider)
    .capabilities.filter((capability) => !handled.has(capability))
    .map((capability) => {
      const spec = CAPABILITIES[capability];
      return {
        agent_id: agentId,
        organization_id: organizationId,
        kind: "integration",
        name: spec.name,
        title: spec.title,
        description: spec.description,
        enabled: true,
        requires_confirmation: spec.confirmByDefault,
        requires_identity: false,
        parameters: spec.parameters,
        config: { capability, provider },
      };
    });
  if (rows.length > 0) await supabaseAdmin.from("actions").insert(rows).throwOnError();
}

export async function removeCapabilities(agentId: string, provider: ProviderId, stillConnected: ProviderId[]) {
  for (const action of await integrationActions(agentId)) {
    if (action.config.provider !== provider || !action.config.capability) continue;
    const capability = action.config.capability;
    const next = stillConnected.find((other) => other !== provider && providerInfo(other).capabilities.includes(capability));
    if (next) {
      await supabaseAdmin
        .from("actions")
        .update({ config: { capability, provider: next }, updated_at: new Date().toISOString() })
        .eq("id", action.id);
    } else {
      await supabaseAdmin.from("actions").delete().eq("id", action.id);
    }
  }
}

// Which connected service handles a capability, when more than one could.
export async function setCapabilityProvider(agentId: string, capability: Capability, provider: ProviderId) {
  await supabaseAdmin
    .from("actions")
    .update({ config: { capability, provider }, updated_at: new Date().toISOString() })
    .eq("agent_id", agentId)
    .eq("kind", "integration")
    .eq("name", CAPABILITIES[capability].name)
    .throwOnError();
}
