import "server-only";
import { EMBEDDING_MODEL_ID, INLINE_SITE_MAP_MAX_CHARS } from "@/config/ai";
import { embedDocuments, embedQuery } from "@/lib/knowledge/index-source";
import { fullQuestion, keywordQuery, type TurnQuestion } from "@/lib/knowledge/search";
import { SITE_MAP_MAX_PAGES } from "@/lib/site-map/pages";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recordUsage, type UsageScope } from "@/lib/usage/record";

// The site map in the prompt:
//   small site maps   every page (most site maps)
//   larger ones       the pages closest to what the visitor is asking, by
//                     meaning and by words, plus the page they're on; the
//                     find_page tool looks up the rest

export type MapPage = { title: string; path: string; description: string; requires_auth: boolean };
export type SiteMapSize = { pages: number; inline: boolean };
export type SiteMapForPrompt = { mode: "empty" | "all" | "search"; pages: MapPage[]; total: number };

const PAGE_COLUMNS = "title, path, description, requires_auth";
const RESULTS_PER_TURN = 12;
const EMBED_BATCH = 100;

export async function siteMapSize(agentId: string): Promise<SiteMapSize> {
  const { data } = await supabaseAdmin.rpc("site_map_totals", { p_agent_id: agentId }).single();
  const totals = data as { pages?: number; chars?: number } | null;
  return { pages: Number(totals?.pages ?? 0), inline: Number(totals?.chars ?? 0) <= INLINE_SITE_MAP_MAX_CHARS };
}

const embeddingText = (page: { title: string; path: string; description: string }) =>
  [page.title, page.path.replace(/[^\p{L}\p{N}]+/gu, " ").trim(), page.description].filter(Boolean).join("\n");

// Embeds the pages that don't have an embedding yet: new, imported or edited
// ones. Run it after the response (after()): a few seconds per 1,000 pages.
// One run per assistant at a time; it picks up pages added while it runs.
const embedding = new Map<string, Promise<void>>();

export function embedSitePages(agentId: string) {
  const running = embedding.get(agentId);
  if (running) return running;
  const run = embedPending(agentId).finally(() => embedding.delete(agentId));
  embedding.set(agentId, run);
  return run;
}

async function embedPending(agentId: string) {
  const { data: agent } = await supabaseAdmin.from("agents").select("organization_id").eq("id", agentId).maybeSingle();
  if (!agent) return;
  let tokens = 0;
  try {
    // A page that fails is retried next time.
    for (let round = 0; round <= SITE_MAP_MAX_PAGES / 500; round++) {
      const { data: pages } = await supabaseAdmin
        .from("site_pages")
        .select("id, title, path, description")
        .eq("agent_id", agentId)
        .is("embedding", null)
        .limit(500);
      if (!pages || pages.length === 0) break;
      for (let i = 0; i < pages.length; i += EMBED_BATCH) {
        const batch = pages.slice(i, i + EMBED_BATCH);
        const result = await embedDocuments(batch.map(embeddingText));
        tokens += result.tokens;
        const rows = batch.map((page, index) => ({ id: page.id, embedding: JSON.stringify(result.embeddings[index]) }));
        const { error } = await supabaseAdmin.rpc("set_site_page_embeddings", { p_rows: rows });
        if (error) throw error;
      }
      if (pages.length < 500) break;
    }
  } catch (error) {
    console.error("Embedding site map pages failed", error);
  } finally {
    if (tokens > 0) {
      // Recorded with knowledge indexing: it's what the assistant knows about the product.
      await recordUsage(
        { organizationId: agent.organization_id, agentId, conversationId: null },
        { stage: "embedding", purpose: "knowledge", modelId: EMBEDDING_MODEL_ID, inputTokens: tokens },
      );
    }
  }
}

// Pages matching a question, by meaning and by words. Without an embedding
// (it failed, or pages aren't embedded yet) the words still match.
export async function searchSitePages(
  agentId: string,
  query: { text: string; context?: string },
  { count = RESULTS_PER_TURN, embedding, usage }: { count?: number; embedding?: number[] | null; usage?: UsageScope } = {},
): Promise<MapPage[]> {
  const full = fullQuestion(query);
  if (!full) return [];
  let vector = embedding ?? null;
  if (embedding === undefined) {
    vector = await embedQuery(full.slice(0, 2000), usage).catch((error) => {
      console.error("Site map search embedding failed", error);
      return null;
    });
  }
  const { data, error } = await supabaseAdmin.rpc("search_site_pages", {
    p_agent_id: agentId,
    p_query_embedding: vector ? JSON.stringify(vector) : null,
    p_keywords: keywordQuery(full),
    p_match_count: count,
  });
  if (error) throw error;
  return ((data ?? []) as MapPage[]).map(({ title, path, description, requires_auth }) => ({ title, path, description, requires_auth }));
}

// The site map entry for the page the visitor is on, if there is one.
async function currentPage(agentId: string, pageUrl: string | null) {
  if (!pageUrl) return null;
  let candidates: string[];
  try {
    const url = new URL(pageUrl);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    candidates = [...new Set([path + url.search, path, `${url.origin}${path}`])];
  } catch {
    return null;
  }
  const { data } = await supabaseAdmin.from("site_pages").select(PAGE_COLUMNS).eq("agent_id", agentId).in("path", candidates).limit(1);
  return (data?.[0] as MapPage | undefined) ?? null;
}

export async function loadSiteMapForPrompt(
  agentId: string,
  size: SiteMapSize,
  question: TurnQuestion | null,
  pageUrl: string | null,
): Promise<SiteMapForPrompt> {
  if (size.pages === 0) return { mode: "empty", pages: [], total: 0 };
  if (size.inline) {
    const { data } = await supabaseAdmin.from("site_pages").select(PAGE_COLUMNS).eq("agent_id", agentId).order("created_at");
    return { mode: "all", pages: (data ?? []) as MapPage[], total: size.pages };
  }
  try {
    const [found, here] = await Promise.all([
      question
        ? question
            .embedding()
            .catch(() => null)
            .then((embedding) => searchSitePages(agentId, question, { embedding }))
        : Promise.resolve([]),
      currentPage(agentId, pageUrl),
    ]);
    const pages = here && !found.some((page) => page.path === here.path) ? [here, ...found] : found;
    return { mode: "search", pages, total: size.pages };
  } catch (error) {
    console.error("Site map search failed", error);
    return { mode: "search", pages: [], total: size.pages };
  }
}
