import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Map, SlidersHorizontal, Zap } from "lucide-react";
import { languageName, VOICE_OPTIONS } from "@/config/voices";
import { requireAgentPage } from "@/lib/auth/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PageBody } from "@/components/dashboard/app-shell";
import { Card, PageHeader } from "@/components/ui/misc";
import { Playground } from "./playground";

export const metadata: Metadata = { title: "Playground" };

export default async function PlaygroundPage({ params }: { params: Promise<{ orgId: string; agentId: string }> }) {
  const { orgId, agentId } = await params;
  const { agent } = await requireAgentPage(orgId, agentId);
  const base = `/account/${orgId}/agents/${agentId}`;

  const [{ count: sources }, { count: actions }, { count: pages }] = await Promise.all([
    supabaseAdmin.from("knowledge_sources").select("id", { count: "exact", head: true }).eq("agent_id", agentId).eq("status", "ready"),
    supabaseAdmin.from("actions").select("id", { count: "exact", head: true }).eq("agent_id", agentId).eq("enabled", true),
    supabaseAdmin.from("site_pages").select("id", { count: "exact", head: true }).eq("agent_id", agentId),
  ]);
  const voice = VOICE_OPTIONS.find((option) => option.id === agent.voice_id)?.name ?? "Custom voice";

  // What the answers come from, one click away from changing it.
  const setup = [
    { href: `${base}/knowledge`, icon: BookOpen, label: "Knowledge", value: `${sources ?? 0} ${sources === 1 ? "source" : "sources"}` },
    { href: `${base}/actions`, icon: Zap, label: "Actions", value: `${actions ?? 0} on` },
    { href: `${base}/site-map`, icon: Map, label: "Site map", value: `${pages ?? 0} ${pages === 1 ? "page" : "pages"}` },
    { href: `${base}/behavior`, icon: SlidersHorizontal, label: "Voice and language", value: `${voice}, ${languageName(agent.language)}` },
  ];

  return (
    <PageBody>
      <PageHeader
        title="Playground"
        description={`Talk to ${agent.assistant_name} the way visitors will. Conversations here are marked as tests, and it won't move pages or run your site's code.`}
      />
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <Playground agentId={agentId} siteUrl={agent.site_url} siteName={agent.site_name || agent.assistant_name} />
        <Card className="overflow-hidden lg:sticky lg:top-6">
          <ul className="divide-y divide-line">
            {setup.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-zinc-50">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
                    <item.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">{item.label}</span>
                    <span className="block truncate text-[12.5px] text-muted">{item.value}</span>
                  </span>
                  <ArrowUpRight className="size-4 text-faint transition-colors group-hover:text-ink" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </PageBody>
  );
}
