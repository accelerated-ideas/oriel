import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAgentPage } from "@/lib/auth/access";
import { PageBody } from "@/components/dashboard/app-shell";
import { PageHeader } from "@/components/ui/misc";
import type { Action } from "@/lib/types";
import { ActionsBody } from "./actions-body";

export const metadata: Metadata = { title: "Actions" };

export default async function ActionsPage({ params }: { params: Promise<{ orgId: string; agentId: string }> }) {
  const { orgId, agentId } = await params;
  const { agent } = await requireAgentPage(orgId, agentId);
  const [{ data: actions }, { count: pageCount }] = await Promise.all([
    supabaseAdmin.from("actions").select("*").eq("agent_id", agentId).in("kind", ["http", "client"]).order("created_at", { ascending: true }),
    supabaseAdmin.from("site_pages").select("id", { count: "exact", head: true }).eq("agent_id", agentId),
  ]);

  // Never send encrypted header values to the browser.
  const safeActions = ((actions ?? []) as Action[]).map((action) => ({
    ...action,
    config: {
      ...action.config,
      headers: ((action.config.headers as { key: string; preview: string }[] | undefined) ?? []).map((header) => ({
        key: header.key,
        preview: header.preview,
      })),
    },
  }));

  return (
    <PageBody>
      <PageHeader
        title="Actions"
        description={`Everything ${agent.assistant_name} can do while it helps someone.`}
      />
      <ActionsBody
        agentId={agentId}
        builtins={agent.builtin_tools ?? {}}
        actions={safeActions}
        pageCount={pageCount ?? 0}
        siteMapHref={`/account/${orgId}/agents/${agentId}/site-map`}
      />
    </PageBody>
  );
}
