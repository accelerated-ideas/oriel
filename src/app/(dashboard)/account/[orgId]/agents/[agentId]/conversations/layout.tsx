import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { requireAgentPage } from "@/lib/auth/access";
import { listConversations } from "@/lib/conversations/list";
import { PageBody } from "@/components/dashboard/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ConversationList } from "./conversation-list";

// The list on the left stays put while conversations open on the right.
export default async function ConversationsLayout({
  params,
  children,
}: {
  params: Promise<{ orgId: string; agentId: string }>;
  children: React.ReactNode;
}) {
  const { orgId, agentId } = await params;
  const { agent } = await requireAgentPage(orgId, agentId);
  const initial = await listConversations(agentId);
  const base = `/account/${orgId}/agents/${agentId}/conversations`;

  if (initial.items.length === 0) {
    return (
      <PageBody>
        <PageHeader title="Conversations" description={`Every call and chat with ${agent.assistant_name}.`} />
        <EmptyState
          className="mt-8"
          icon={<MessagesSquare />}
          title="No conversations yet"
          action={
            <Button asChild variant="outline">
              <Link href={`/account/${orgId}/agents/${agentId}/install`}>Install the bubble</Link>
            </Button>
          }
        />
      </PageBody>
    );
  }

  return (
    // Fills the panel under the top bar (8px page padding + 57px bar + 8px).
    // Visitors' conversations are masked in session recordings (ph-mask).
    <div className="ph-mask flex flex-col lg:h-[calc(100dvh-73px)] lg:flex-row">
      <ConversationList agentId={agentId} base={base} initial={initial} />
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto scrollbar-thin">{children}</section>
    </div>
  );
}
