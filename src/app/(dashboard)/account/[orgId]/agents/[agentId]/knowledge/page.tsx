import type { Metadata } from "next";
import { after } from "next/server";
import { IS_CLOUD } from "@/config/edition";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAgentPage } from "@/lib/auth/access";
import { getWorkspaceBilling, knowledgeRoom, refreshPolicy } from "@/lib/billing/limits";
import { planState } from "@/lib/billing/plan-state";
import { wakeWorkerIfStalled } from "@/lib/knowledge/queue";
import { PageBody } from "@/components/dashboard/app-shell";
import { PageHeader } from "@/components/ui/misc";
import type { KnowledgeImport, KnowledgeSource } from "@/lib/types";
import { KnowledgeBody, type SourceFilter } from "./knowledge-body";

export const metadata: Metadata = { title: "Knowledge" };

const PAGE_SIZE = 50;
const FILTERS: SourceFilter[] = ["all", "website", "file", "note", "pinned", "failed"];

export default async function KnowledgePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; agentId: string }>;
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  const { orgId, agentId } = await params;
  const query = await searchParams;
  const { agent } = await requireAgentPage(orgId, agentId);

  const filter = FILTERS.includes(query.type as SourceFilter) ? (query.type as SourceFilter) : "all";
  const search = (query.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number(query.page) || 1);

  let sourcesQuery = supabaseAdmin
    .from("knowledge_sources")
    .select(
      "id, kind, title, url, file_name, status, error, char_count, chunk_count, created_at, updated_at, fetched_at, rendered, always_include",
      { count: "exact" },
    )
    .eq("agent_id", agentId);
  if (filter === "website") sourcesQuery = sourcesQuery.eq("kind", "url");
  if (filter === "file") sourcesQuery = sourcesQuery.eq("kind", "file");
  if (filter === "note") sourcesQuery = sourcesQuery.eq("kind", "text");
  if (filter === "pinned") sourcesQuery = sourcesQuery.eq("always_include", true);
  if (filter === "failed") sourcesQuery = sourcesQuery.eq("status", "error");
  if (search) {
    // PostgREST filter syntax treats these as separators, so they can't be searched for.
    const pattern = `%${search.replace(/[,()%*\\]/g, " ")}%`;
    sourcesQuery = sourcesQuery.or(`title.ilike.${pattern},url.ilike.${pattern},file_name.ilike.${pattern}`);
  }

  const [{ data: sourceRows, count }, { data: importRows }, { data: totals }, workspace, { data: workspaceChars }, policy, room] =
    await Promise.all([
      sourcesQuery.order("always_include", { ascending: false }).order("created_at", { ascending: false }).range(0, page * PAGE_SIZE - 1),
      supabaseAdmin.rpc("knowledge_import_progress", { p_agent_id: agentId, p_limit: 5 }),
      supabaseAdmin.rpc("knowledge_totals", { p_agent_id: agentId }).single(),
      IS_CLOUD ? getWorkspaceBilling(orgId) : null,
      IS_CLOUD ? supabaseAdmin.rpc("knowledge_characters_used", { p_organization_id: orgId }) : { data: null },
      refreshPolicy(orgId),
      knowledgeRoom(orgId),
    ]);

  // Notes open in an editor, so they need their text.
  const sources = (sourceRows ?? []) as Omit<KnowledgeSource, "content">[];
  const noteIds = sources.filter((source) => source.kind === "text").map((source) => source.id);
  const { data: notes } = noteIds.length
    ? await supabaseAdmin.from("knowledge_sources").select("id, content").in("id", noteIds)
    : { data: [] };
  const noteText = new Map((notes ?? []).map((note) => [note.id as string, note.content as string]));

  const state = workspace ? planState(workspace) : null;
  const limit = state && state.kind !== "inactive" ? state.plan.includes.knowledge_characters : null;

  after(() => wakeWorkerIfStalled(agentId));

  return (
    <PageBody>
      <PageHeader
        title="Knowledge"
        description={`What ${agent.assistant_name} knows about your product. It answers from this and says so when something isn't covered.`}
      />
      <KnowledgeBody
        agentId={agentId}
        siteUrl={agent.site_url}
        sources={sources.map((source) => ({ ...source, content: noteText.get(source.id) ?? "" }))}
        total={count ?? 0}
        hasMore={(count ?? 0) > page * PAGE_SIZE}
        page={page}
        filter={filter}
        search={search}
        imports={(importRows ?? []) as KnowledgeImport[]}
        size={{
          assistant: Number((totals as { total_chars?: number } | null)?.total_chars ?? 0),
          pinned: Number((totals as { pinned_chars?: number } | null)?.pinned_chars ?? 0),
          workspace: workspaceChars === null ? null : Number(workspaceChars),
          limit,
        }}
        policy={policy}
        room={room}
      />
    </PageBody>
  );
}
