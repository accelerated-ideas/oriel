import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth/get-user";
import { getMemberships } from "@/lib/auth/access";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import { monthPeriod, type UsageCountRow } from "@/lib/usage/period";
import { PRICING_VERSION } from "@/lib/usage/pricing";
import { PageBody } from "@/components/dashboard/app-shell";
import { WorkspaceShell } from "@/components/dashboard/workspace-shell";
import { PeriodSwitcher } from "@/components/usage/period-switcher";
import { Card, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Costs" };
export const dynamic = "force-dynamic";

type CostRow = {
  organization_id: string;
  stage: "transcription" | "llm" | "tts" | "embedding";
  purpose: "reply" | "summary" | "call" | "knowledge" | "search";
  model_id: string;
  events: number;
  turns: number;
  cost_usd: number;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  characters: number | null;
  audio_seconds: number | null;
};

const STAGES = [
  { key: "llm", label: "Language model", tone: "bg-accent" },
  { key: "tts", label: "Speech", tone: "bg-[#3b9eff]" },
  { key: "transcription", label: "Transcription", tone: "bg-zinc-800" },
  { key: "embedding", label: "Knowledge", tone: "bg-[#2ec4a5]" },
] as const;

// Small numbers need more digits to mean anything.
function usd(value: number) {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 100) return `$${value.toFixed(2)}`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}
const n = (value: number) => Math.round(value).toLocaleString("en-US");
const plural = (value: number, word: string) => `${n(value)} ${word}${Math.round(value) === 1 ? "" : "s"}`;
const sum = <T,>(rows: T[], pick: (row: T) => number | null | undefined) => rows.reduce((total, row) => total + Number(pick(row) ?? 0), 0);

export default async function CostsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/auth");
  if (!isPlatformAdmin(user.email)) notFound();

  const { month } = await searchParams;
  const period = monthPeriod(month);
  const range = { p_from: period.from.toISOString(), p_to: period.to.toISOString() };

  const [memberships, { data: costData }, { data: countData }, { data: costliestData }] = await Promise.all([
    getMemberships(user.id),
    supabaseAdmin.rpc("cost_breakdown", range),
    supabaseAdmin.rpc("usage_counts", { ...range, p_organization_id: null }),
    supabaseAdmin.rpc("costliest_conversations", { ...range, p_limit: 10 }),
  ]);
  if (memberships.length === 0) redirect("/account");

  const costs = (costData ?? []) as CostRow[];
  const counts = (countData ?? []) as UsageCountRow[];
  const costliest = (costliestData ?? []) as { conversation_id: string; organization_id: string; agent_id: string | null; cost_usd: number; turns: number }[];

  const orgIds = [...new Set([...costs.map((row) => row.organization_id), ...counts.map((row) => row.organization_id)])];
  const [{ data: orgs }, { data: conversations }, { data: agents }] = await Promise.all([
    orgIds.length ? supabaseAdmin.from("organizations").select("id, name").in("id", orgIds) : Promise.resolve({ data: [] }),
    costliest.length
      ? supabaseAdmin.from("conversations").select("id, title").in("id", costliest.map((row) => row.conversation_id))
      : Promise.resolve({ data: [] }),
    costliest.length
      ? supabaseAdmin.from("agents").select("id, assistant_name, site_name").in("id", costliest.map((row) => row.agent_id).filter(Boolean) as string[])
      : Promise.resolve({ data: [] }),
  ]);
  const orgName = new Map((orgs ?? []).map((org) => [org.id as string, org.name as string]));
  const conversationTitle = new Map((conversations ?? []).map((row) => [row.id as string, (row.title as string | null) ?? "Untitled"]));
  const agentName = new Map(
    (agents ?? []).map((row) => [row.id as string, row.site_name ? `${row.assistant_name} (${row.site_name})` : (row.assistant_name as string)]),
  );

  const total = sum(costs, (row) => row.cost_usd);
  const messages = sum(counts, (row) => row.messages);
  const conversationCount = sum(counts, (row) => row.conversations);
  const replyRows = costs.filter((row) => row.purpose === "reply");
  const replyTurns = sum(costs.filter((row) => row.stage === "llm" && row.purpose === "reply"), (row) => row.turns);
  const callSeconds = sum(costs.filter((row) => row.stage === "transcription"), (row) => row.audio_seconds);

  const stats = [
    { label: "Total", value: usd(total) },
    { label: "Per message", value: messages ? usd(total / messages) : "—", hint: plural(messages, "visitor message") },
    { label: "Per conversation", value: conversationCount ? usd(total / conversationCount) : "—", hint: plural(conversationCount, "conversation") },
    { label: "Per reply", value: replyTurns ? usd(sum(replyRows, (row) => row.cost_usd) / replyTurns) : "—", hint: "Model plus speech" },
  ];

  const stageTotals = STAGES.map((stage) => {
    const rows = costs.filter((row) => row.stage === stage.key);
    const cost = sum(rows, (row) => row.cost_usd);
    const units =
      stage.key === "llm"
        ? `${n(sum(rows, (row) => row.input_tokens))} tokens in · ${n(sum(rows, (row) => row.output_tokens))} out`
        : stage.key === "tts"
          ? `${n(sum(rows, (row) => row.characters))} characters`
          : stage.key === "embedding"
            ? `${n(sum(rows, (row) => row.input_tokens))} tokens embedded`
            : plural(callSeconds / 60, "call minute");
    return { ...stage, cost, units, share: total ? cost / total : 0 };
  });

  const models = Object.values(
    costs.reduce<Record<string, { key: string; stage: string; purpose: string; model: string; events: number; cost: number }>>((acc, row) => {
      const key = `${row.stage}:${row.purpose}:${row.model_id}`;
      acc[key] ??= { key, stage: row.stage, purpose: row.purpose, model: row.model_id, events: 0, cost: 0 };
      acc[key].events += Number(row.events);
      acc[key].cost += Number(row.cost_usd);
      return acc;
    }, {}),
  ).sort((a, b) => b.cost - a.cost);

  const workspaces = orgIds
    .map((id) => {
      const cost = sum(costs.filter((row) => row.organization_id === id), (row) => row.cost_usd);
      const own = counts.filter((row) => row.organization_id === id);
      const workspaceMessages = sum(own, (row) => row.messages);
      return {
        id,
        name: orgName.get(id) ?? "Deleted workspace",
        conversations: sum(own, (row) => row.conversations),
        messages: workspaceMessages,
        cost,
        perMessage: workspaceMessages ? cost / workspaceMessages : null,
      };
    })
    .sort((a, b) => b.cost - a.cost);

  const home = memberships[0];

  return (
    <WorkspaceShell context={{ user, membership: home, memberships }}>
      <PageBody>
        <PageHeader
          title="Costs"
          description="What conversations cost us across every workspace. Only platform admins see this."
          actions={<PeriodSwitcher base="/admin/costs" label={period.label} previous={period.previous} next={period.next} />}
        />

        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-5">
              <p className="text-[13.5px] font-medium text-muted">{stat.label}</p>
              <p className="mt-2 font-display text-[36px] leading-none tabular">{stat.value}</p>
              {stat.hint && <p className="mt-2 text-[12.5px] text-muted">{stat.hint}</p>}
            </Card>
          ))}
        </div>

        <Card className="mt-3 p-5 sm:p-6">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-zinc-100">
            {stageTotals.map((stage) => (
              <div key={stage.key} className={stage.tone} style={{ width: `${stage.share * 100}%` }} />
            ))}
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {stageTotals.map((stage) => (
              <div key={stage.key}>
                <p className="flex items-center gap-2 text-[13.5px] font-medium">
                  <span className={cn("size-2.5 rounded-full", stage.tone)} />
                  {stage.label}
                  <span className="text-muted tabular">{Math.round(stage.share * 100)}%</span>
                </p>
                <p className="mt-1 text-[22px] font-semibold tabular">{usd(stage.cost)}</p>
                <p className="mt-0.5 text-[12.5px] text-muted tabular">{stage.units}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <p className="border-b border-line px-5 py-3.5 text-[15px] font-semibold">By model</p>
            <div className="divide-y divide-line">
              {models.length === 0 && <p className="px-5 py-6 text-[13.5px] text-muted">Nothing recorded this month.</p>}
              {models.map((model) => (
                <div key={model.key} className="flex items-center justify-between gap-4 px-5 py-3 text-[13.5px]">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[12.5px]">{model.model}</p>
                    <p className="text-[12px] text-muted">
                      {model.stage === "llm"
                        ? model.purpose === "summary"
                          ? "Summaries"
                          : "Replies"
                        : model.stage === "tts"
                          ? "Speech"
                          : model.stage === "embedding"
                            ? model.purpose === "search"
                              ? "Knowledge search"
                              : "Knowledge indexing"
                            : "Transcription"}{" "}
                      · {plural(model.events, "call")}
                    </p>
                  </div>
                  <span className="font-medium tabular">{usd(model.cost)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <p className="border-b border-line px-5 py-3.5 text-[15px] font-semibold">Most expensive conversations</p>
            <div className="divide-y divide-line">
              {costliest.length === 0 && <p className="px-5 py-6 text-[13.5px] text-muted">Nothing recorded this month.</p>}
              {costliest.map((row) => (
                <div key={row.conversation_id} className="flex items-center justify-between gap-4 px-5 py-3 text-[13.5px]">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{conversationTitle.get(row.conversation_id) ?? "Untitled"}</p>
                    <p className="truncate text-[12px] text-muted">
                      {orgName.get(row.organization_id) ?? "Workspace"} · {row.agent_id ? (agentName.get(row.agent_id) ?? "Assistant") : "Assistant"} ·{" "}
                      {plural(row.turns, "reply").replace("replys", "replies")}
                    </p>
                  </div>
                  <span className="font-medium tabular">{usd(Number(row.cost_usd))}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="mt-3 overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_repeat(4,minmax(80px,auto))] gap-x-6 border-b border-line px-5 py-3 text-[12.5px] font-medium text-muted">
            <span>Workspace</span>
            <span className="text-right">Conversations</span>
            <span className="text-right">Messages</span>
            <span className="text-right">Cost</span>
            <span className="text-right">Per message</span>
          </div>
          <div className="divide-y divide-line">
            {workspaces.length === 0 && <p className="px-5 py-6 text-[13.5px] text-muted">Nothing recorded this month.</p>}
            {workspaces.map((workspace) => (
              <div
                key={workspace.id}
                className="grid grid-cols-[minmax(0,1fr)_repeat(4,minmax(80px,auto))] items-center gap-x-6 px-5 py-3.5 text-[14px]"
              >
                <span className="truncate font-medium">{workspace.name}</span>
                <span className="text-right tabular">{n(workspace.conversations)}</span>
                <span className="text-right tabular">{n(workspace.messages)}</span>
                <span className="text-right tabular">{usd(workspace.cost)}</span>
                <span className="text-right tabular">{workspace.perMessage === null ? "—" : usd(workspace.perMessage)}</span>
              </div>
            ))}
          </div>
        </Card>

        <p className="mt-4 text-[12.5px] text-muted">
          Estimates from list prices ({PRICING_VERSION}), using the rate on the day of each call. Costs are recorded from October 5, 2026.
        </p>
      </PageBody>
    </WorkspaceShell>
  );
}
