import type { Metadata } from "next";
import { requireAgentPage } from "@/lib/auth/access";
import { availableChatModelIds } from "@/lib/ai";
import { PageBody } from "@/components/dashboard/app-shell";
import { PageHeader } from "@/components/ui/misc";
import { BehaviorForm } from "./behavior-form";

export const metadata: Metadata = { title: "Behavior" };

export default async function BehaviorPage({ params }: { params: Promise<{ orgId: string; agentId: string }> }) {
  const { orgId, agentId } = await params;
  const { agent } = await requireAgentPage(orgId, agentId);

  return (
    <PageBody>
      <PageHeader title="Behavior" description={`Who ${agent.assistant_name} is, how it sounds, and what it should always keep in mind.`} />
      <BehaviorForm agent={agent} availableModels={availableChatModelIds()} />
    </PageBody>
  );
}
