import type { Metadata } from "next";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAgentPage } from "@/lib/auth/access";
import { PageBody } from "@/components/dashboard/app-shell";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import type { Insight, InsightType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { InsightList } from "./insight-list";

export const metadata: Metadata = { title: "Insights" };

const INSIGHT_LABELS: Record<InsightType, string> = {
  bug: "Bugs",
  feature_request: "Feature requests",
  confusion: "Confusion",
  complaint: "Complaints",
  churn_risk: "Churn risk",
  handoff: "Follow-ups",
  praise: "Praise",
  other: "Other",
};

export default async function InsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; agentId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { orgId, agentId } = await params;
  const { status } = await searchParams;
  const { agent } = await requireAgentPage(orgId, agentId);
  const showResolved = status === "resolved";

  const { data } = await supabaseAdmin
    .from("insights")
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(500);
  const all = (data ?? []) as Insight[];
  const visible = all.filter((insight) => (showResolved ? insight.status === "resolved" : insight.status === "open"));
  const base = `/account/${orgId}/agents/${agentId}/insights`;

  return (
    <PageBody>
      <PageHeader
        title="Insights"
        description={`What people struggle with, ask for and complain about, gathered by ${agent.assistant_name} while it helps them.`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={showResolved ? base : `${base}?status=resolved`}>{showResolved ? "Show open" : "Show resolved"}</Link>
          </Button>
        }
      />

      {visible.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Lightbulb />}
          title={showResolved ? "Nothing resolved yet" : "No open insights"}
        />
      ) : (
        <InsightList
          agentId={agentId}
          insights={visible}
          labels={INSIGHT_LABELS}
          conversationBase={`/account/${orgId}/agents/${agentId}/conversations`}
        />
      )}
    </PageBody>
  );
}
