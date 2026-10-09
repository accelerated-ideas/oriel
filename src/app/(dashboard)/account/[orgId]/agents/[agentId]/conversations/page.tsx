import type { Metadata } from "next";
import { requireAgentPage } from "@/lib/auth/access";
import { listConversations } from "@/lib/conversations/list";
import { ConversationDetail } from "./conversation-detail";

export const metadata: Metadata = { title: "Conversations" };

// With nothing picked, the newest conversation is open (on phones, only the list shows).
export default async function ConversationsPage({ params }: { params: Promise<{ orgId: string; agentId: string }> }) {
  const { orgId, agentId } = await params;
  const { agent } = await requireAgentPage(orgId, agentId);
  const { items } = await listConversations(agentId);
  if (items.length === 0) return null;
  return (
    <div className="hidden flex-1 flex-col lg:flex">
      <ConversationDetail agent={agent} conversationId={items[0].id} backHref={`/account/${orgId}/agents/${agentId}/conversations`} />
    </div>
  );
}
