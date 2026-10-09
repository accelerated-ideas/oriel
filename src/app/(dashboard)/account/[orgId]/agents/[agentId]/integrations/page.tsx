import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAgentPage } from "@/lib/auth/access";
import { PROVIDERS } from "@/lib/integrations/catalog";
import { availableProviders } from "@/lib/integrations/providers";
import { STRIPE_KEY_PERMISSIONS, stripeAppModes } from "@/lib/integrations/stripe";
import { PageBody } from "@/components/dashboard/app-shell";
import { PageHeader } from "@/components/ui/misc";
import type { Action, Integration } from "@/lib/types";
import type { SafeAction } from "../actions/tool-row";
import { IntegrationsBody } from "./integrations-body";
import { ServiceCards, type ServiceAction, type ServiceConnection } from "./service-cards";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; agentId: string }>;
  searchParams: Promise<{ stripe?: string; integration?: string; result?: string }>;
}) {
  const { orgId, agentId } = await params;
  const { stripe: notice, integration, result } = await searchParams;
  const { agent } = await requireAgentPage(orgId, agentId);
  const [{ data: actions }, { data: stripe }, { data: services }, { data: serviceActions }] = await Promise.all([
    supabaseAdmin.from("actions").select("*").eq("agent_id", agentId).eq("kind", "stripe").order("created_at", { ascending: true }),
    supabaseAdmin
      .from("integrations")
      .select("id, provider, metadata, config, created_at")
      .eq("agent_id", agentId)
      .eq("provider", "stripe")
      .maybeSingle(),
    supabaseAdmin.from("integrations").select("provider, metadata, config").eq("agent_id", agentId).neq("provider", "stripe"),
    supabaseAdmin.from("actions").select("*").eq("agent_id", agentId).eq("kind", "integration").order("created_at", { ascending: true }),
  ]);
  const available = availableProviders();

  const stripeActions = ((actions ?? []) as Action[]).map((action) => ({
    ...action,
    config: { ...action.config, headers: [] },
  })) as SafeAction[];

  return (
    <PageBody>
      <PageHeader title="Integrations" description={`Services ${agent.assistant_name} can work with on someone's behalf.`} />
      <IntegrationsBody
        agentId={agentId}
        assistantName={agent.assistant_name}
        stripe={stripe as Pick<Integration, "id" | "metadata" | "config" | "created_at"> | null}
        stripeActions={stripeActions}
        appModes={stripeAppModes()}
        permissions={STRIPE_KEY_PERMISSIONS.map((permission) => ({ ...permission }))}
        notice={notice ?? null}
      />
      <ServiceCards
        agentId={agentId}
        assistantName={agent.assistant_name}
        providers={PROVIDERS.filter((provider) => available.some((entry) => entry.id === provider.id))}
        connections={((services ?? []) as ServiceConnection[]).filter((service) => !service.metadata?.pending)}
        actions={(serviceActions ?? []) as ServiceAction[]}
        oauthReady={Object.fromEntries(available.map((entry) => [entry.id, entry.oauthReady]))}
        notice={integration && result ? { provider: integration, result } : null}
      />
    </PageBody>
  );
}
