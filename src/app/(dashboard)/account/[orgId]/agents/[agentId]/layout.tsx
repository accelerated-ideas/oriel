import { requireAgentPage } from "@/lib/auth/access";
import { AgentTopBar } from "@/components/dashboard/agent-top-bar";

export const dynamic = "force-dynamic";

export default async function AgentLayout({
  params,
  children,
}: {
  params: Promise<{ orgId: string; agentId: string }>;
  children: React.ReactNode;
}) {
  const { orgId, agentId } = await params;
  const { agent } = await requireAgentPage(orgId, agentId);
  return (
    <>
      <AgentTopBar
        orgId={orgId}
        agentId={agent.id}
        name={agent.assistant_name}
        isLive={agent.is_live}
        accentColor={agent.accent_color}
        avatarStyle={agent.avatar_style}
      />
      {children}
    </>
  );
}
