import "server-only";
import { createHmac } from "node:crypto";
import { appUrl } from "@/config/brand";
import { refreshPolicy } from "@/lib/billing/limits";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { DiscoverOptions } from "./discover";

// Knowledge work runs in the background (worker.ts, /api/knowledge/worker):
// adding sources queues jobs, then wakes the worker. Callers wake it from
// `after()`, so the request that queued the work isn't held up.

export const IMPORT_MAX_PAGES = 10_000;

// Shared by the worker endpoint and Vercel Cron (which sends CRON_SECRET).
export function workerSecret() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  return createHmac("sha256", process.env.WIDGET_SESSION_SECRET ?? "").update("knowledge-worker").digest("hex");
}

export async function wakeWorker() {
  try {
    await fetch(appUrl("/api/knowledge/worker"), {
      method: "POST",
      headers: { authorization: `Bearer ${workerSecret()}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error("Couldn't wake the knowledge worker", error);
  }
}

// Wakes the worker when work is waiting but nothing is running (e.g. a worker
// was cut off). Cheap enough to call when the Knowledge page loads.
export async function wakeWorkerIfStalled(agentId: string) {
  await supabaseAdmin.rpc("settle_knowledge_imports");
  const now = new Date().toISOString();
  const [{ count: waiting }, { count: running }] = await Promise.all([
    supabaseAdmin
      .from("knowledge_jobs")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .eq("status", "queued")
      .lte("run_after", now),
    supabaseAdmin
      .from("knowledge_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "running")
      .gt("locked_until", now),
  ]);
  if ((waiting ?? 0) > 0 && (running ?? 0) === 0) await wakeWorker();
}

// Pages per second in slow mode, as the spacing between their jobs.
const SLOW_SPACING_SECONDS = 3;

// Finds pages (crawl or sitemap). With autoAdd they're read right away;
// otherwise the owner chooses which to add (addPages).
export async function startImport(input: {
  agentId: string;
  organizationId: string;
  url: string;
  pageLimit: number;
  options?: DiscoverOptions;
  autoAdd?: boolean;
}) {
  const options = input.options ?? { mode: "crawl" as const };
  const { data: knowledgeImport } = await supabaseAdmin
    .from("knowledge_imports")
    .insert({
      agent_id: input.agentId,
      organization_id: input.organizationId,
      url: input.url,
      mode: options.mode,
      options: { exclude: options.exclude ?? [], includeQuery: options.includeQuery ?? false, slow: options.slow ?? false },
      auto_add: input.autoAdd ?? false,
      page_limit: Math.min(Math.max(1, Math.round(input.pageLimit)), IMPORT_MAX_PAGES),
    })
    .select("id")
    .single()
    .throwOnError();
  await supabaseAdmin
    .from("knowledge_jobs")
    .insert({ agent_id: input.agentId, kind: "find", import_id: knowledgeImport.id })
    .throwOnError();
  return knowledgeImport.id as string;
}

export async function queueSources(sourceIds: string[], importId: string | null = null, { slow = false } = {}) {
  let queued = 0;
  for (let i = 0; i < sourceIds.length; i += 500) {
    const { data } = await supabaseAdmin
      .rpc("queue_index_jobs", {
        p_source_ids: sourceIds.slice(i, i + 500),
        p_import_id: importId,
        p_spacing_seconds: slow ? SLOW_SPACING_SECONDS : 0,
      })
      .throwOnError();
    queued += Number(data ?? 0);
  }
  return queued;
}

// Turns found pages into sources and queues them. Pages this assistant
// already has are linked to the import and read again rather than duplicated.
export async function addPages(knowledgeImport: {
  id: string;
  agent_id: string;
  organization_id: string;
  options?: { slow?: boolean } | null;
}, urls: string[]) {
  const sourceIds: string[] = [];
  for (let i = 0; i < urls.length; i += 100) {
    const batch = urls.slice(i, i + 100);
    const { data: existing } = await supabaseAdmin
      .from("knowledge_sources")
      .select("id, url")
      .eq("agent_id", knowledgeImport.agent_id)
      .eq("kind", "url")
      .in("url", batch);
    const known = new Map((existing ?? []).map((row) => [row.url as string, row.id as string]));
    if (known.size > 0) {
      await supabaseAdmin.from("knowledge_sources").update({ import_id: knowledgeImport.id }).in("id", [...known.values()]);
    }
    const fresh = batch.filter((url) => !known.has(url));
    if (fresh.length > 0) {
      const { data: created } = await supabaseAdmin
        .from("knowledge_sources")
        .insert(
          fresh.map((url) => ({
            agent_id: knowledgeImport.agent_id,
            organization_id: knowledgeImport.organization_id,
            kind: "url",
            title: url,
            url,
            import_id: knowledgeImport.id,
          })),
        )
        .select("id")
        .throwOnError();
      sourceIds.push(...(created ?? []).map((row) => row.id as string));
    }
    sourceIds.push(...known.values());
    await supabaseAdmin.from("knowledge_found_pages").update({ added: true }).eq("import_id", knowledgeImport.id).in("url", batch);
  }
  await queueSources(sourceIds, knowledgeImport.id, { slow: Boolean(knowledgeImport.options?.slow) });
  await supabaseAdmin
    .from("knowledge_imports")
    .update({ status: "reading", finished_at: null })
    .eq("id", knowledgeImport.id)
    .in("status", ["finding", "found", "done"]);
  return sourceIds.length;
}

// Re-reads website pages, at most once per the plan's refresh interval each.
// Failed pages can always be retried. Unchanged pages cost a fetch, not an
// embedding (see index-source.ts).
export async function refreshSources(organizationId: string, sourceIds: string[]) {
  const policy = await refreshPolicy(organizationId);
  const cutoff = Date.now() - policy.everyHours * 3_600_000;
  const due: string[] = [];
  let skipped = 0;
  let nextAt: number | null = null;
  for (let i = 0; i < sourceIds.length; i += 200) {
    const { data } = await supabaseAdmin
      .from("knowledge_sources")
      .select("id, kind, status, fetched_at, created_at")
      .eq("organization_id", organizationId)
      .in("id", sourceIds.slice(i, i + 200));
    for (const source of data ?? []) {
      if (source.kind !== "url" && source.status !== "error") continue;
      const readAt = new Date(source.fetched_at ?? source.created_at).getTime();
      if (source.status === "error" || readAt <= cutoff) {
        due.push(source.id);
      } else {
        skipped++;
        const availableAt = readAt + policy.everyHours * 3_600_000;
        nextAt = nextAt === null ? availableAt : Math.min(nextAt, availableAt);
      }
    }
  }
  // A failed page goes back to waiting; a working one stays searchable while it's read again.
  if (due.length > 0) {
    await supabaseAdmin.from("knowledge_sources").update({ status: "pending", error: null }).in("id", due).eq("status", "error");
  }
  const queued = await queueSources(due);
  return { queued, skipped, nextAt: nextAt === null ? null : new Date(nextAt).toISOString() };
}

// Daily cron: queues pages due for automatic refresh, per each workspace's plan.
export async function queueAutomaticRefresh() {
  const { data } = await supabaseAdmin.rpc("organizations_with_pages");
  let queued = 0;
  for (const organizationId of (data ?? []) as string[]) {
    const policy = await refreshPolicy(organizationId);
    if (!policy.autoDays) continue;
    const { data: count } = await supabaseAdmin.rpc("queue_stale_sources", {
      p_organization_id: organizationId,
      p_older_than: `${policy.autoDays} days`,
      p_limit: 10_000,
    });
    queued += Number(count ?? 0);
  }
  return queued;
}

export async function cancelImport(importId: string) {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("knowledge_imports")
    .update({ status: "canceled", finished_at: now })
    .eq("id", importId)
    .in("status", ["finding", "found", "reading"]);
  await supabaseAdmin
    .from("knowledge_jobs")
    .update({ status: "canceled", finished_at: now })
    .eq("import_id", importId)
    .eq("status", "queued");
  // Pages that were waiting go back to how they were.
  await supabaseAdmin
    .from("knowledge_sources")
    .update({ status: "error", error: "The import was stopped before this page was read." })
    .eq("import_id", importId)
    .eq("status", "pending");
}
