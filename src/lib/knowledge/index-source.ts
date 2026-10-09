import "server-only";
import { embed, embedMany } from "ai";
import { google } from "@/lib/ai";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL_ID } from "@/config/ai";
import { knowledgeRoom } from "@/lib/billing/limits";
import { sha256 } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recordUsage, type UsageScope } from "@/lib/usage/record";
import { errorMessage } from "@/lib/utils";
import { readPage } from "./read-page";
import type { PageRenderer } from "./renderer";

const CHUNK_TARGET = 1100;
const CHUNK_OVERLAP = 160;
const MAX_SOURCE_CHARS = 400_000;

// ---------- chunking ----------

function splitParagraph(paragraph: string): string[] {
  const lines = paragraph.split("\n");
  // A Markdown table: keep its header with every piece so columns stay labeled.
  if (lines.length > 2 && lines.every((line) => line.trim().startsWith("|"))) {
    const header = lines.slice(0, 2).join("\n");
    const pieces: string[] = [];
    let rows: string[] = [];
    for (const row of lines.slice(2)) {
      if (rows.length > 0 && (header + rows.join("\n") + row).length > CHUNK_TARGET) {
        pieces.push(`${header}\n${rows.join("\n")}`);
        rows = [];
      }
      rows.push(row);
    }
    if (rows.length > 0) pieces.push(`${header}\n${rows.join("\n")}`);
    return pieces;
  }
  if (paragraph.length <= CHUNK_TARGET * 1.5) return [paragraph];
  // A very long paragraph: split between sentences.
  const pieces: string[] = [];
  let current = "";
  for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
    if (current && (current + " " + sentence).length > CHUNK_TARGET) {
      pieces.push(current);
      current = current.slice(-CHUNK_OVERLAP) + " " + sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

// Splits Markdown into ~1.1k character chunks along headings and paragraphs.
// Each chunk starts with where it came from ("Pricing › Pro plan"), so it
// carries its context into search and into the prompt.
export function chunkText(text: string, title: string) {
  type Section = { path: string[]; paragraphs: string[] };
  const sections: Section[] = [{ path: [], paragraphs: [] }];
  const headings: string[] = [];

  for (const block of text.split(/\n{2,}/)) {
    let trimmed = block.trim();
    if (!trimmed) continue;
    // A heading starts a new section (with or without a blank line after it).
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/m);
    if (heading && trimmed.startsWith(heading[0])) {
      const level = heading[1].length;
      headings.length = level - 1;
      headings[level - 1] = heading[2].replace(/[#*_`]/g, "").trim();
      sections.push({ path: headings.filter(Boolean), paragraphs: [] });
      trimmed = trimmed.slice(heading[0].length).trim();
      if (!trimmed) continue;
    }
    sections[sections.length - 1].paragraphs.push(...splitParagraph(trimmed));
  }

  const chunks: string[] = [];
  for (const section of sections) {
    const label = [title, ...section.path.filter((part) => part !== title)].join(" › ");
    let current = "";
    for (const paragraph of section.paragraphs) {
      if (current && (current + "\n\n" + paragraph).length > CHUNK_TARGET) {
        chunks.push(`${label}\n\n${current}`);
        current = paragraph.startsWith("|") ? paragraph : `${current.slice(-CHUNK_OVERLAP)}\n\n${paragraph}`;
      } else {
        current = current ? `${current}\n\n${paragraph}` : paragraph;
      }
    }
    if (current.trim()) chunks.push(`${label}\n\n${current.trim()}`);
  }
  return chunks;
}

// ---------- embeddings ----------

const embeddingModel = () => google.embedding(EMBEDDING_MODEL_ID);

// Gemini doesn't report token counts for embeddings: estimate them (about four
// characters per token) so costs are still tracked.
function tokensFor(reported: number | undefined, texts: string[]) {
  if (typeof reported === "number" && Number.isFinite(reported) && reported > 0) return reported;
  return Math.ceil(texts.reduce((sum, text) => sum + text.length, 0) / 4);
}

export async function embedDocuments(values: string[]) {
  const { embeddings, usage } = await embedMany({
    model: embeddingModel(),
    values,
    maxParallelCalls: 4,
    providerOptions: { google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: "RETRIEVAL_DOCUMENT" } },
  });
  return { embeddings, tokens: tokensFor(usage?.tokens, values) };
}

export async function embedQuery(value: string, scope?: UsageScope) {
  const { embedding, usage } = await embed({
    model: embeddingModel(),
    value,
    providerOptions: { google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: "RETRIEVAL_QUERY" } },
  });
  if (scope) {
    void recordUsage(scope, {
      stage: "embedding",
      purpose: "search",
      modelId: EMBEDDING_MODEL_ID,
      inputTokens: tokensFor(usage?.tokens, [value]),
    });
  }
  return embedding;
}

// ---------- indexing ----------

export class KnowledgeLimitError extends Error {
  constructor() {
    super("Your plan's knowledge limit is reached. Remove some sources or upgrade on the Billing page.");
  }
}

export type IndexResult = { ok: true; changed: boolean } | { ok: false; error: string; limitReached: boolean };

async function update(sourceId: string, patch: Record<string, unknown>) {
  await supabaseAdmin
    .from("knowledge_sources")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", sourceId);
}

// Reads (for website pages), chunks and embeds one source. Safe to re-run: a
// page whose text hasn't changed isn't embedded again.
export async function indexKnowledgeSource(sourceId: string, renderer: PageRenderer | null = null): Promise<IndexResult> {
  const { data: source } = await supabaseAdmin.from("knowledge_sources").select("*").eq("id", sourceId).maybeSingle();
  if (!source) return { ok: true, changed: false };

  // A source already in use stays searchable until its new version is ready.
  if (source.status !== "ready") await update(sourceId, { status: "processing", error: null });

  try {
    let content: string = source.content ?? "";
    let title: string = source.title;
    let rendered: boolean = source.rendered;

    if (source.kind === "url" && source.url) {
      const page = await readPage(source.url, renderer);
      content = page.text;
      rendered = page.rendered;
      if (!source.title || source.title === source.url || source.import_id) title = page.title || source.url;
    }

    content = content.slice(0, MAX_SOURCE_CHARS);
    if (content.trim().length < 20) throw new Error("No readable text was found.");

    const hash = sha256(content);
    if (hash === source.content_hash && source.chunk_count > 0) {
      await update(sourceId, { status: "ready", error: null, title, fetched_at: new Date().toISOString() });
      return { ok: true, changed: false };
    }

    const room = await knowledgeRoom(source.organization_id, sourceId);
    if (room !== null && content.length > room) throw new KnowledgeLimitError();

    const chunks = chunkText(content, title);
    const { embeddings, tokens } = await embedDocuments(chunks);

    await supabaseAdmin.from("knowledge_chunks").delete().eq("source_id", sourceId).throwOnError();
    const rows = chunks.map((chunk, index) => ({
      source_id: sourceId,
      agent_id: source.agent_id,
      chunk_index: index,
      content: chunk,
      embedding: JSON.stringify(embeddings[index]),
    }));
    for (let i = 0; i < rows.length; i += 100) {
      await supabaseAdmin.from("knowledge_chunks").insert(rows.slice(i, i + 100)).throwOnError();
    }

    await update(sourceId, {
      status: "ready",
      error: null,
      title,
      content,
      rendered,
      content_hash: hash,
      fetched_at: new Date().toISOString(),
      char_count: content.length,
      chunk_count: chunks.length,
    });
    await recordUsage(
      { organizationId: source.organization_id, agentId: source.agent_id, conversationId: null },
      { stage: "embedding", purpose: "knowledge", modelId: EMBEDDING_MODEL_ID, inputTokens: tokens },
    );
    return { ok: true, changed: true };
  } catch (error) {
    const message = errorMessage(error).slice(0, 300);
    await update(sourceId, { status: "error", error: message, fetched_at: new Date().toISOString() });
    return { ok: false, error: message, limitReached: error instanceof KnowledgeLimitError };
  }
}
