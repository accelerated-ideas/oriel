"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { Check, RotateCcw } from "lucide-react";
import { actionSetInsightStatus } from "@/server-actions/insights";
import { runAction } from "@/lib/run-action";
import type { Insight, InsightType } from "@/lib/types";
import { Badge, Card } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

const SEVERITY_TONE = { high: "danger", medium: "warning", low: "neutral" } as const;

export function InsightList({
  agentId,
  insights,
  labels,
  conversationBase,
}: {
  agentId: string;
  insights: Insight[];
  labels: Record<InsightType, string>;
  conversationBase: string;
}) {
  const router = useRouter();
  return (
    // Masked in session recordings: insights quote visitors.
    <Card className="ph-mask mt-8 divide-y divide-line overflow-hidden">
      {insights.map((insight) => (
        <div key={insight.id} className="flex gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={insight.type === "handoff" ? "accent" : "neutral"}>{labels[insight.type]}</Badge>
              <Badge tone={SEVERITY_TONE[insight.severity]}>{insight.severity}</Badge>
              <span className="text-[12.5px] text-muted">
                {formatDistanceToNowStrict(new Date(insight.created_at), { addSuffix: true })}
              </span>
            </div>
            <p className="mt-2 text-[15px] font-medium">{insight.title}</p>
            {insight.details && <p className="mt-1 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">{insight.details}</p>}
            <div className="mt-2 flex flex-wrap gap-x-3 text-[12.5px] text-muted">
              {insight.user_email && <span>{insight.user_email}</span>}
              {insight.page_url && <span className="font-mono text-[12px]">{insight.page_url}</span>}
              {insight.conversation_id && (
                <Link href={`${conversationBase}/${insight.conversation_id}`} className="font-medium text-accent-ink underline-offset-2 hover:underline">
                  Open conversation
                </Link>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant={insight.status === "open" ? "outline" : "ghost"}
            className="shrink-0"
            onClick={() =>
              runAction(() => actionSetInsightStatus(agentId, insight.id, insight.status === "open" ? "resolved" : "open"), {
                onSuccess: () => router.refresh(),
              })
            }
          >
            {insight.status === "open" ? <Check /> : <RotateCcw />}
            {insight.status === "open" ? "Resolve" : "Reopen"}
          </Button>
        </div>
      ))}
    </Card>
  );
}
