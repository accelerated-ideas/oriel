"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PINNED_KNOWLEDGE_MAX_CHARS } from "@/config/ai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { authorizeAgent } from "@/lib/auth/access";
import { extractFileText } from "@/lib/knowledge/extract";
import {
  addPages,
  cancelImport,
  IMPORT_MAX_PAGES,
  queueSources,
  refreshSources,
  startImport,
  wakeWorker,
} from "@/lib/knowledge/queue";
import { assertPublicUrl } from "@/lib/actions/ssrf";
import { errorMessage } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";
import { reportError } from "@/lib/notify";

// Adding knowledge queues background work (src/lib/knowledge/worker.ts); the
// Knowledge page shows progress as it happens.

const MAX_FILE_BYTES = 8 * 1024 * 1024;

function knowledgePath(organizationId: string, agentId: string) {
  return `/account/${organizationId}/agents/${agentId}/knowledge`;
}

async function queueAndWake(sourceIds: string[]) {
  await queueSources(sourceIds);
  after(() => wakeWorker());
}

const excludeRule = z.object({
  match: z.enum(["starts_with", "ends_with", "contains", "exact", "wildcard"]),
  value: z.string().trim().min(1).max(200),
});

const findSchema = z.object({
  agentId: z.string().uuid(),
  mode: z.enum(["crawl", "sitemap"]),
  url: z.string().trim().min(1, "Enter a URL").max(500),
  exclude: z.array(excludeRule).max(30).default([]),
  includeQuery: z.boolean().default(false),
  slow: z.boolean().default(false),
  limit: z.number().int().min(1).max(IMPORT_MAX_PAGES).default(500),
});

function withScheme(url: string) {
  return url.includes("://") ? url : `https://${url}`;
}

// Finds a site's pages (crawl) or a sitemap's; the owner then chooses which to add.
export async function actionFindPages(input: z.input<typeof findSchema>): Promise<ActionResult> {
  try {
    const data = findSchema.parse(input);
    const access = await authorizeAgent(data.agentId);
    if (!access.ok) return access;
    const url = withScheme(data.url);
    try {
      await assertPublicUrl(url);
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
    await startImport({
      agentId: data.agentId,
      organizationId: access.agent.organization_id,
      url,
      pageLimit: data.limit,
      options: { mode: data.mode, exclude: data.exclude, includeQuery: data.includeQuery, slow: data.slow },
    });
    after(() => wakeWorker());
    revalidatePath(knowledgePath(access.agent.organization_id, data.agentId));
    return { ok: true };
  } catch (error) {
    await reportError("actionFindPages", error, { agent: input.agentId });
    return { ok: false, error: error instanceof z.ZodError ? error.issues[0].message : "Couldn't start finding pages." };
  }
}

// One page, added and read right away.
export async function actionAddPage(input: { agentId: string; url: string }): Promise<ActionResult> {
  try {
    const access = await authorizeAgent(input.agentId);
    if (!access.ok) return access;
    const url = withScheme(input.url.trim());
    try {
      await assertPublicUrl(url);
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
    const { data: existing } = await supabaseAdmin
      .from("knowledge_sources")
      .select("id")
      .eq("agent_id", input.agentId)
      .eq("kind", "url")
      .eq("url", url)
      .maybeSingle();
    if (existing) return { ok: false, error: "That page is already in knowledge. Use “Read again” to refresh it." };
    const { data: created } = await supabaseAdmin
      .from("knowledge_sources")
      .insert({ agent_id: input.agentId, organization_id: access.agent.organization_id, kind: "url", title: url, url })
      .select("id")
      .single()
      .throwOnError();
    await queueAndWake([created.id]);
    revalidatePath(knowledgePath(access.agent.organization_id, input.agentId));
    return { ok: true };
  } catch (error) {
    await reportError("actionAddPage", error, { agent: input.agentId });
    return { ok: false, error: "Couldn't add that page." };
  }
}

async function ownImport(agentId: string, importId: string) {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return { access, knowledgeImport: null };
  const { data } = await supabaseAdmin
    .from("knowledge_imports")
    .select("id, agent_id, organization_id, options, status")
    .eq("id", importId)
    .eq("agent_id", agentId)
    .maybeSingle();
  return { access, knowledgeImport: data };
}

const FOUND_PAGE_SIZE = 100;

// For ILIKE patterns: % and _ mean "anything", so match them literally.
const likeEscape = (text: string) => text.replace(/[%_\\]/g, "\\$&");

// Pages an import found that haven't been added yet, for choosing.
export async function actionListFoundPages(input: {
  agentId: string;
  importId: string;
  query?: string;
  offset?: number;
}): Promise<ActionResult<{ urls: string[]; total: number }>> {
  const { access, knowledgeImport } = await ownImport(input.agentId, input.importId);
  if (!access.ok) return access;
  if (!knowledgeImport) return { ok: false, error: "That import is gone." };
  let request = supabaseAdmin
    .from("knowledge_found_pages")
    .select("url", { count: "exact" })
    .eq("import_id", input.importId)
    .eq("added", false);
  const query = likeEscape(input.query?.trim() ?? "");
  if (query) request = request.ilike("url", `%${query}%`);
  const offset = Math.max(0, input.offset ?? 0);
  const { data, count } = await request.order("url").range(offset, offset + FOUND_PAGE_SIZE - 1);
  return { ok: true, data: { urls: (data ?? []).map((row) => row.url as string), total: count ?? 0 } };
}

// Adds the chosen pages: either the listed ones, or every page matching the
// search except the listed ones ("select all" with a few unticked).
export async function actionAddFoundPages(input: {
  agentId: string;
  importId: string;
  selection: { all: boolean; query: string; urls: string[] };
}): Promise<ActionResult<{ added: number }>> {
  try {
    const { access, knowledgeImport } = await ownImport(input.agentId, input.importId);
    if (!access.ok) return access;
    if (!knowledgeImport) return { ok: false, error: "That import is gone." };

    let urls: string[] = [];
    if (input.selection.all) {
      const skip = new Set(input.selection.urls);
      const query = likeEscape(input.selection.query.trim());
      for (let offset = 0; ; offset += 1000) {
        let request = supabaseAdmin
          .from("knowledge_found_pages")
          .select("url")
          .eq("import_id", input.importId)
          .eq("added", false);
        if (query) request = request.ilike("url", `%${query}%`);
        const { data } = await request.order("url").range(offset, offset + 999);
        urls.push(...(data ?? []).map((row) => row.url as string).filter((url) => !skip.has(url)));
        if (!data || data.length < 1000) break;
      }
    } else {
      const { data } = await supabaseAdmin
        .from("knowledge_found_pages")
        .select("url")
        .eq("import_id", input.importId)
        .in("url", input.selection.urls.slice(0, IMPORT_MAX_PAGES));
      urls = (data ?? []).map((row) => row.url as string);
    }
    if (urls.length === 0) return { ok: false, error: "Choose at least one page." };

    const added = await addPages(knowledgeImport, urls);
    after(() => wakeWorker());
    revalidatePath(knowledgePath(access.agent.organization_id, input.agentId));
    return { ok: true, data: { added } };
  } catch (error) {
    await reportError("actionAddFoundPages", error, { agent: input.agentId });
    return { ok: false, error: "Couldn't add those pages." };
  }
}

type RefreshResult = ActionResult<{ queued: number; skipped: number; nextAt: string | null }>;

// Re-reads the chosen pages, within the plan's refresh limits.
export async function actionRefreshSources(input: { agentId: string; sourceIds: string[] }): Promise<RefreshResult> {
  const access = await authorizeAgent(input.agentId);
  if (!access.ok) return access;
  const { data } = await supabaseAdmin
    .from("knowledge_sources")
    .select("id")
    .eq("agent_id", input.agentId)
    .in("id", input.sourceIds.slice(0, 1000));
  const result = await refreshSources(access.agent.organization_id, (data ?? []).map((row) => row.id as string));
  if (result.queued > 0) after(() => wakeWorker());
  revalidatePath(knowledgePath(access.agent.organization_id, input.agentId));
  return { ok: true, data: result };
}

// Re-reads every page an import brought in, within the plan's refresh limits.
export async function actionRefreshImport(input: { agentId: string; importId: string }): Promise<RefreshResult> {
  const { access, knowledgeImport } = await ownImport(input.agentId, input.importId);
  if (!access.ok) return access;
  if (!knowledgeImport) return { ok: false, error: "That import is gone." };
  const ids: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await supabaseAdmin
      .from("knowledge_sources")
      .select("id")
      .eq("import_id", input.importId)
      .order("created_at")
      .range(offset, offset + 999);
    ids.push(...(data ?? []).map((row) => row.id as string));
    if (!data || data.length < 1000) break;
  }
  const result = await refreshSources(access.agent.organization_id, ids);
  if (result.queued > 0) after(() => wakeWorker());
  revalidatePath(knowledgePath(access.agent.organization_id, input.agentId));
  return { ok: true, data: result };
}

export async function actionDeleteSources(input: { agentId: string; sourceIds: string[] }): Promise<ActionResult> {
  const access = await authorizeAgent(input.agentId);
  if (!access.ok) return access;
  for (let i = 0; i < input.sourceIds.length; i += 200) {
    await supabaseAdmin
      .from("knowledge_sources")
      .delete()
      .eq("agent_id", input.agentId)
      .in("id", input.sourceIds.slice(i, i + 200))
      .throwOnError();
  }
  revalidatePath(knowledgePath(access.agent.organization_id, input.agentId));
  return { ok: true };
}

const textSchema = z.object({
  agentId: z.string().uuid(),
  sourceId: z.string().uuid().nullish(),
  title: z.string().trim().min(1, "Add a title").max(200),
  content: z.string().trim().min(10, "Write a little more").max(200_000),
});

export async function actionSaveTextSource(input: z.input<typeof textSchema>): Promise<ActionResult> {
  try {
    const data = textSchema.parse(input);
    const access = await authorizeAgent(data.agentId);
    if (!access.ok) return access;

    let sourceId = data.sourceId ?? null;
    if (sourceId) {
      await supabaseAdmin
        .from("knowledge_sources")
        .update({ title: data.title, content: data.content, updated_at: new Date().toISOString() })
        .eq("id", sourceId)
        .eq("agent_id", data.agentId)
        .eq("kind", "text")
        .throwOnError();
    } else {
      const { data: row } = await supabaseAdmin
        .from("knowledge_sources")
        .insert({
          agent_id: data.agentId,
          organization_id: access.agent.organization_id,
          kind: "text",
          title: data.title,
          content: data.content,
        })
        .select("id")
        .single()
        .throwOnError();
      sourceId = row.id;
    }
    await queueAndWake([sourceId!]);
    revalidatePath(knowledgePath(access.agent.organization_id, data.agentId));
    return { ok: true };
  } catch (error) {
    await reportError("actionSaveTextSource", error, { agent: input.agentId });
    return { ok: false, error: error instanceof z.ZodError ? error.issues[0].message : "Couldn't save the note." };
  }
}

export async function actionUploadFiles(formData: FormData): Promise<ActionResult<{ failed: string[] }>> {
  const agentId = String(formData.get("agentId") ?? "");
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;

  const files = formData.getAll("files").filter((value): value is File => value instanceof File);
  if (files.length === 0) return { ok: false, error: "Choose at least one file." };

  const failed: string[] = [];
  const created: string[] = [];
  for (const file of files.slice(0, 10)) {
    if (file.size > MAX_FILE_BYTES) {
      failed.push(`${file.name} is larger than 8 MB`);
      continue;
    }
    try {
      const content = await extractFileText(file);
      if (content.length < 20) throw new Error("no readable text");
      const { data } = await supabaseAdmin
        .from("knowledge_sources")
        .insert({
          agent_id: agentId,
          organization_id: access.agent.organization_id,
          kind: "file",
          title: file.name.replace(/\.[a-z0-9]+$/i, ""),
          file_name: file.name,
          mime_type: file.type || null,
          content,
        })
        .select("id")
        .single();
      if (data) created.push(data.id);
    } catch (error) {
      failed.push(`${file.name}: ${errorMessage(error)}`);
    }
  }
  if (created.length > 0) await queueAndWake(created);
  revalidatePath(knowledgePath(access.agent.organization_id, agentId));
  return { ok: true, data: { failed } };
}

export async function actionDeleteSource(agentId: string, sourceId: string): Promise<ActionResult> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  const { error } = await supabaseAdmin.from("knowledge_sources").delete().eq("id", sourceId).eq("agent_id", agentId);
  if (error) return { ok: false, error: "Couldn't delete it." };
  revalidatePath(knowledgePath(access.agent.organization_id, agentId));
  return { ok: true };
}

// Pinned sources are in every prompt, whatever the question.
export async function actionSetPinned(agentId: string, sourceId: string, pinned: boolean): Promise<ActionResult> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  if (pinned) {
    const { data: rows } = await supabaseAdmin
      .from("knowledge_sources")
      .select("id, char_count, always_include")
      .eq("agent_id", agentId)
      .or(`always_include.eq.true,id.eq.${sourceId}`);
    const total = (rows ?? []).reduce((sum, row) => sum + (row.char_count ?? 0), 0);
    if (total > PINNED_KNOWLEDGE_MAX_CHARS) {
      return {
        ok: false,
        error: `Pinned sources can add up to ${PINNED_KNOWLEDGE_MAX_CHARS.toLocaleString("en-US")} characters, since they're in every reply. Unpin something first, or pin a shorter source.`,
      };
    }
  }
  await supabaseAdmin
    .from("knowledge_sources")
    .update({ always_include: pinned })
    .eq("id", sourceId)
    .eq("agent_id", agentId)
    .throwOnError();
  revalidatePath(knowledgePath(access.agent.organization_id, agentId));
  return { ok: true };
}

export async function actionCancelImport(agentId: string, importId: string): Promise<ActionResult> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  const { data } = await supabaseAdmin.from("knowledge_imports").select("id").eq("id", importId).eq("agent_id", agentId).maybeSingle();
  if (data) await cancelImport(importId);
  revalidatePath(knowledgePath(access.agent.organization_id, agentId));
  return { ok: true };
}

// Removes every page an import brought in (pages also in a newer import stay with it).
export async function actionDeleteImportPages(agentId: string, importId: string): Promise<ActionResult> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  const { data } = await supabaseAdmin.from("knowledge_imports").select("id").eq("id", importId).eq("agent_id", agentId).maybeSingle();
  if (!data) return { ok: true };
  await cancelImport(importId);
  await supabaseAdmin.from("knowledge_sources").delete().eq("import_id", importId).eq("agent_id", agentId).throwOnError();
  await supabaseAdmin.from("knowledge_imports").delete().eq("id", importId).throwOnError();
  revalidatePath(knowledgePath(access.agent.organization_id, agentId));
  return { ok: true };
}
