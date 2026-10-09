import "server-only";
import { INLINE_KNOWLEDGE_MAX_CHARS } from "@/config/ai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { UsageScope } from "@/lib/usage/record";
import type { MessageRow } from "@/lib/types";
import { embedQuery } from "./index-source";

export type KnowledgeSnippet = { title: string; url: string | null; content: string };

const RESULTS_PER_TURN = 6;

// Words too common to help a keyword search.
const STOP_WORDS = new Set(
  "the and for are but not you your with this that what how can does did have has was were will would could should about from into there their they them when where which who why our out get got any all its just like want need please tell know help thanks".split(
    " ",
  ),
);

// The words of a question worth matching exactly ("pro", "stripe", "e1043"),
// as a Postgres full-text OR query.
export function keywordQuery(text: string) {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => (word.length >= 3 || /\d/.test(word)) && !STOP_WORDS.has(word));
  return [...new Set(words)].slice(0, 12).join(" | ");
}

// Meaning (embeddings) and exact words (full-text), merged in the database.
export async function searchKnowledge(
  agentId: string,
  query: { text: string; context?: string },
  { count = RESULTS_PER_TURN, usage, embedding: given }: { count?: number; usage?: UsageScope; embedding?: number[] } = {},
): Promise<KnowledgeSnippet[]> {
  const text = query.text.trim();
  if (!text) return [];
  const full = fullQuestion(query);
  const embedding = given ?? (await embedQuery(full.slice(0, 2000), usage));
  const { data, error } = await supabaseAdmin.rpc("search_knowledge", {
    p_agent_id: agentId,
    p_query_embedding: JSON.stringify(embedding),
    p_keywords: keywordQuery(full),
    p_match_count: count,
  });
  if (error) throw error;
  return (data ?? []).map((row: { source_title: string; source_url: string | null; content: string }) => ({
    title: row.source_title,
    url: row.source_url,
    content: row.content,
  }));
}

// Follow-ups ("how much is it?") are searched together with what came before.
export function fullQuestion(query: { text: string; context?: string }) {
  const text = query.text.trim();
  return query.context ? `${query.context}\n${text}` : text;
}

// A short message usually leans on the one before it.
const FOLLOW_UP_MAX_WORDS = 12;

export type TurnQuestion = {
  text: string;
  context?: string;
  // Searched for both knowledge and the site map, so embedded once.
  embedding: () => Promise<number[]>;
};

// What the visitor is asking this turn, or null before they've said anything.
export function turnQuestion(rows: MessageRow[], usage?: UsageScope): TurnQuestion | null {
  const visitor = rows.filter((row) => row.role === "user" && row.content.trim());
  const latest = visitor.at(-1)?.content.trim();
  if (!latest) return null;
  const previous = visitor.at(-2)?.content.trim();
  const short = latest.split(/\s+/).length <= FOLLOW_UP_MAX_WORDS;
  const question = { text: latest, context: short && previous ? previous : undefined };
  let embedding: Promise<number[]> | null = null;
  return { ...question, embedding: () => (embedding ??= embedQuery(fullQuestion(question).slice(0, 2000), usage)) };
}

// What goes into the prompt this turn:
//   small knowledge bases   everything (cheaper and more reliable than searching)
//   larger ones             pinned sources, plus the best matches for the question
// `snippets` are the same every turn (they go in the system prompt, which
// providers cache); `found` are this turn's matches (they go after the
// latest message).
export async function loadKnowledgeForPrompt(
  agentId: string,
  question: TurnQuestion | null,
): Promise<{ mode: "empty" | "inline" | "retrieval"; snippets: KnowledgeSnippet[]; found: KnowledgeSnippet[] }> {
  const { data: totals } = await supabaseAdmin.rpc("knowledge_totals", { p_agent_id: agentId }).single();
  const total = Number((totals as { total_chars?: number } | null)?.total_chars ?? 0);
  const pinnedChars = Number((totals as { pinned_chars?: number } | null)?.pinned_chars ?? 0);
  if (total === 0) return { mode: "empty", snippets: [], found: [] };

  const inline = total <= INLINE_KNOWLEDGE_MAX_CHARS;
  let sourcesQuery = supabaseAdmin
    .from("knowledge_sources")
    .select("title, url, content")
    .eq("agent_id", agentId)
    .eq("status", "ready")
    .order("created_at", { ascending: true });
  if (!inline) sourcesQuery = sourcesQuery.eq("always_include", true);
  const { data: sources } = inline || pinnedChars > 0 ? await sourcesQuery : { data: [] };
  const included = (sources ?? []).map((source) => ({ title: source.title, url: source.url, content: source.content }));
  if (inline) return { mode: "inline", snippets: included, found: [] };

  if (!question) return { mode: "retrieval", snippets: included, found: [] };
  try {
    const found = await searchKnowledge(agentId, question, { embedding: await question.embedding() });
    return { mode: "retrieval", snippets: included, found };
  } catch (error) {
    console.error("Knowledge search failed", error);
    return { mode: "retrieval", snippets: included, found: [] };
  }
}
