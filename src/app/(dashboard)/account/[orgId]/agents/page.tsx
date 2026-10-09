import type { Metadata } from "next";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import Link from "next/link";
import { ArrowUpRight, Globe } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireOrgPage } from "@/lib/auth/access";
import { PageBody } from "@/components/dashboard/app-shell";
import { WorkspaceShell } from "@/components/dashboard/workspace-shell";
import { PendingInvitations } from "@/components/dashboard/pending-invitations";
import { invitationsFor } from "@/lib/workspaces/invitations";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { NewAgentButton } from "./new-agent-button";

export const metadata: Metadata = { title: "Assistants" };
export const dynamic = "force-dynamic";

export default async function AgentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { orgId } = await params;
  const { new: openNew } = await searchParams;
  const context = await requireOrgPage(orgId);
  const invitations = context.user.email ? await invitationsFor(context.user.email) : [];

  const { data: agents } = await supabaseAdmin
    .from("agents")
    .select("id, site_name, site_url, is_live, assistant_name, accent_color, avatar_style, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const stats = await Promise.all(
    (agents ?? []).map(async (agent) => {
      const [{ count: conversations }, { count: insights }] = await Promise.all([
        supabaseAdmin
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", agent.id)
          .gt("message_count", 1)
          .gte("created_at", since),
        supabaseAdmin
          .from("insights")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", agent.id)
          .eq("status", "open"),
      ]);
      return { id: agent.id, conversations: conversations ?? 0, insights: insights ?? 0 };
    }),
  );

  return (
    <WorkspaceShell context={context}>
      <PageBody>
        <PageHeader
          title="Assistants"
          description="Each assistant lives on one website or app, with its own knowledge, voice and actions."
          actions={<NewAgentButton organizationId={orgId} defaultOpen={openNew === "1" || ((agents ?? []).length === 0 && invitations.length === 0)} />}
        />
        <PendingInvitations invitations={invitations} />

        {(agents ?? []).length === 0 ? (
          <EmptyState
            className="mt-10"
            icon={<Globe />}
            title="Create your first assistant"
            description="Point it at your website and it will read your pages, so it can answer questions from the first call."
          />
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {(agents ?? []).map((agent) => {
              const stat = stats.find((item) => item.id === agent.id);
              return (
                <Link
                  key={agent.id}
                  href={`/account/${orgId}/agents/${agent.id}/playground`}
                  className="group flex flex-col rounded-2xl bg-surface p-6 shadow-border transition-shadow duration-150 hover:shadow-pop"
                >
                  <div className="flex items-start justify-between gap-4">
                    <AgentAvatar color={agent.accent_color} look={agent.avatar_style} className="size-10" />
                    <Badge tone={agent.is_live ? "success" : "neutral"}>{agent.is_live ? "Live" : "Off"}</Badge>
                  </div>
                  <h2 className="mt-5 font-display text-[26px] leading-tight">{agent.assistant_name}</h2>
                  <p className="mt-1 min-h-5 truncate text-[14px] text-muted">
                    {[agent.site_name, agent.site_url && new URL(agent.site_url).hostname].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-6 flex items-center gap-6 border-t border-line pt-4 text-[13.5px]">
                    <div>
                      <span className="font-semibold tabular">{stat?.conversations ?? 0}</span>
                      <span className="text-muted"> conversations, 30 days</span>
                    </div>
                    <div>
                      <span className="font-semibold tabular">{stat?.insights ?? 0}</span>
                      <span className="text-muted"> open insights</span>
                    </div>
                    <ArrowUpRight className="ml-auto size-4 text-faint transition-colors group-hover:text-ink" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </PageBody>
    </WorkspaceShell>
  );
}
