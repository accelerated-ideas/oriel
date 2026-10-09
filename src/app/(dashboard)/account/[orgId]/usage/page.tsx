import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireOrgPage } from "@/lib/auth/access";
import { monthPeriod, type UsageCountRow } from "@/lib/usage/period";
import { PageBody } from "@/components/dashboard/app-shell";
import { WorkspaceShell } from "@/components/dashboard/workspace-shell";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { DailyBars, PeriodSwitcher } from "@/components/usage/period-switcher";
import { Card, PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Usage" };
export const dynamic = "force-dynamic";

const number = (value: number) => value.toLocaleString("en-US");
const minutes = (seconds: number) =>
  Math.round(seconds / 60).toLocaleString("en-US");

export default async function UsagePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { orgId } = await params;
  const { month } = await searchParams;
  const context = await requireOrgPage(orgId);
  const period = monthPeriod(month);

  const [{ data: agents }, { data: counts }] = await Promise.all([
    supabaseAdmin
      .from("agents")
      .select("id, assistant_name, site_name, accent_color, avatar_style")
      .eq("organization_id", orgId)
      .order("created_at"),
    supabaseAdmin.rpc("usage_counts", {
      p_from: period.from.toISOString(),
      p_to: period.to.toISOString(),
      p_organization_id: orgId,
    }),
  ]);
  const rows = (counts ?? []) as UsageCountRow[];

  const totals = rows.reduce(
    (sum, row) => ({
      conversations: sum.conversations + Number(row.conversations),
      messages: sum.messages + Number(row.messages),
      voiceSeconds: sum.voiceSeconds + Number(row.voice_seconds),
    }),
    { conversations: 0, messages: 0, voiceSeconds: 0 },
  );
  const messagesByDay = new Map<string, number>();
  for (const row of rows)
    messagesByDay.set(
      row.day,
      (messagesByDay.get(row.day) ?? 0) + Number(row.messages),
    );
  const byAgent = (agents ?? []).map((agent) => {
    const own = rows.filter((row) => row.agent_id === agent.id);
    return {
      ...agent,
      conversations: own.reduce(
        (sum, row) => sum + Number(row.conversations),
        0,
      ),
      messages: own.reduce((sum, row) => sum + Number(row.messages), 0),
      voiceSeconds: own.reduce(
        (sum, row) => sum + Number(row.voice_seconds),
        0,
      ),
    };
  });

  const stats = [
    { label: "Conversations", value: number(totals.conversations) },
    { label: "Messages", value: number(totals.messages) },
    { label: "Call minutes", value: minutes(totals.voiceSeconds) },
  ];

  return (
    <WorkspaceShell context={context}>
      <PageBody>
        <PageHeader
          title="Usage"
          description="Conversations and messages across all your assistants."
          actions={
            <PeriodSwitcher
              base={`/account/${orgId}/usage`}
              label={period.label}
              previous={period.previous}
              next={period.next}
            />
          }
        />

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-5">
              <p className="text-[13.5px] font-medium text-muted">
                {stat.label}
              </p>
              <p className="mt-2 font-display text-[42px] leading-none tabular">
                {stat.value}
              </p>
            </Card>
          ))}
        </div>

        <Card className="mt-3 p-5 sm:p-6">
          <p className="text-[15px] font-semibold">Messages per day</p>
          <div className="mt-6">
            <DailyBars
              days={period.days}
              values={messagesByDay}
              unit="messages"
            />
          </div>
          <div className="mt-2 flex justify-between text-[12px] text-faint tabular">
            <span>
              {new Date(period.from).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })}
            </span>
            <span>
              {new Date(period.to.getTime() - 86_400_000).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", timeZone: "UTC" },
              )}
            </span>
          </div>
        </Card>

        {byAgent.length > 0 && (
          <Card className="mt-3 overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(72px,auto))] gap-x-6 border-b border-line px-5 py-3 text-[12.5px] font-medium text-muted">
              <span>Assistant</span>
              <span className="text-right">Conversations</span>
              <span className="text-right">Messages</span>
              <span className="text-right">Call minutes</span>
            </div>
            <div className="divide-y divide-line">
              {byAgent.map((agent) => (
                <div
                  key={agent.id}
                  className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(72px,auto))] items-center gap-x-6 px-5 py-3.5 text-[14px]"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <AgentAvatar
                      color={agent.accent_color}
                      look={agent.avatar_style}
                      className="size-5"
                    />
                    <span className="truncate font-medium">
                      {agent.assistant_name}
                      {agent.site_name && <span className="font-normal text-muted"> · {agent.site_name}</span>}
                    </span>
                  </span>
                  <span className="text-right tabular">
                    {number(agent.conversations)}
                  </span>
                  <span className="text-right tabular">
                    {number(agent.messages)}
                  </span>
                  <span className="text-right tabular">
                    {minutes(agent.voiceSeconds)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </PageBody>
    </WorkspaceShell>
  );
}
