import type { Metadata } from "next";
import { requireAgentPage } from "@/lib/auth/access";
import { ConversationDetail } from "../conversation-detail";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ orgId: string; agentId: string; conversationId: string }>;
}) {
  const { orgId, agentId, conversationId } = await params;
  const { agent } = await requireAgentPage(orgId, agentId);
  return (
    <ConversationDetail
      agent={agent}
      conversationId={conversationId}
      backHref={`/account/${orgId}/agents/${agentId}/conversations`}
    />
  );
}
