import { redirect } from "next/navigation";

export default async function AgentIndex({ params }: { params: Promise<{ orgId: string; agentId: string }> }) {
  const { orgId, agentId } = await params;
  redirect(`/account/${orgId}/agents/${agentId}/playground`);
}
