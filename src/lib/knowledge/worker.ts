import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/utils";
import { discoverPages, type DiscoverOptions } from "./discover";
import { indexKnowledgeSource } from "./index-source";
import { addPages } from "./queue";
import { PageRenderer } from "./renderer";

// Runs queued knowledge jobs until there are none or time is nearly up.
// Several workers can run at once: jobs are claimed with row locks, and a job
// whose worker died is picked up again when its lease runs out.

const CLAIM_SIZE = 6;
const CONCURRENCY = 3;
const LEASE_SECONDS = 240;
const MAX_ATTEMPTS = 3;

type Job = {
  id: number;
  agent_id: string;
  kind: "find" | "index";
  import_id: string | null;
  source_id: string | null;
  attempts: number;
};

async function inBatches<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(run));
}

async function finishJob(job: Job, status: "done" | "failed", error: string | null = null) {
  await supabaseAdmin
    .from("knowledge_jobs")
    .update({ status, error, locked_until: null, finished_at: new Date().toISOString() })
    .eq("id", job.id);
}

// Finds an import's pages. The setup import adds them all right away; others
// wait for the owner to choose (knowledge_found_pages).
async function findPages(job: Job, renderer: PageRenderer) {
  const { data: knowledgeImport } = await supabaseAdmin.from("knowledge_imports").select("*").eq("id", job.import_id!).maybeSingle();
  if (!knowledgeImport || knowledgeImport.status === "canceled") return;

  const options = (knowledgeImport.options ?? {}) as Omit<DiscoverOptions, "mode">;
  const urls = await discoverPages(knowledgeImport.url, knowledgeImport.page_limit, renderer, {
    mode: knowledgeImport.mode,
    ...options,
  });
  if (urls.length === 0) throw new Error("Couldn't find any pages at that address.");

  await supabaseAdmin.from("knowledge_imports").update({ pages_found: urls.length }).eq("id", knowledgeImport.id);
  if (knowledgeImport.auto_add) {
    await addPages(knowledgeImport, urls);
    return;
  }
  for (let i = 0; i < urls.length; i += 500) {
    await supabaseAdmin
      .from("knowledge_found_pages")
      .upsert(
        urls.slice(i, i + 500).map((url) => ({ import_id: knowledgeImport.id, url })),
        { onConflict: "import_id,url", ignoreDuplicates: true },
      )
      .throwOnError();
  }
  await supabaseAdmin.from("knowledge_imports").update({ status: "found" }).eq("id", knowledgeImport.id).eq("status", "finding");
}

// The plan's knowledge limit was reached mid-import: stop the rest.
async function stopImport(importId: string, error: string) {
  const now = new Date().toISOString();
  await supabaseAdmin.from("knowledge_jobs").update({ status: "canceled", finished_at: now }).eq("import_id", importId).eq("status", "queued");
  await supabaseAdmin.from("knowledge_imports").update({ status: "failed", error, finished_at: now }).eq("id", importId);
}

async function finishImportIfDone(importId: string) {
  const { count } = await supabaseAdmin
    .from("knowledge_jobs")
    .select("id", { count: "exact", head: true })
    .eq("import_id", importId)
    .in("status", ["queued", "running"]);
  if ((count ?? 0) > 0) return;
  await supabaseAdmin
    .from("knowledge_imports")
    .update({ status: "done", finished_at: new Date().toISOString() })
    .eq("id", importId)
    .in("status", ["finding", "reading"]);
}

async function runJob(job: Job, renderer: PageRenderer) {
  try {
    if (job.attempts > MAX_ATTEMPTS) {
      await finishJob(job, "failed", "Gave up after several tries.");
    } else if (job.kind === "find") {
      await findPages(job, renderer);
      await finishJob(job, "done");
    } else {
      // Page-level problems (a 404, no text) are recorded on the source itself.
      const result = await indexKnowledgeSource(job.source_id!, renderer);
      if (!result.ok && result.limitReached && job.import_id) await stopImport(job.import_id, result.error);
      await finishJob(job, result.ok ? "done" : "failed", result.ok ? null : result.error);
    }
  } catch (error) {
    // Unexpected failures are retried with a growing delay.
    const message = errorMessage(error).slice(0, 300);
    if (job.attempts < MAX_ATTEMPTS) {
      await supabaseAdmin
        .from("knowledge_jobs")
        .update({ status: "queued", error: message, locked_until: null, run_after: new Date(Date.now() + 30_000 * job.attempts).toISOString() })
        .eq("id", job.id);
      return;
    }
    await finishJob(job, "failed", message);
    if (job.kind === "find" && job.import_id) {
      await supabaseAdmin
        .from("knowledge_imports")
        .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
        .eq("id", job.import_id);
    }
  } finally {
    if (job.import_id) await finishImportIfDone(job.import_id);
  }
}

// When the next job can be claimed, or null when nothing is waiting: the
// earliest queued job, or a running job whose lease runs out (its worker may
// have been cut off; if not, it renews nothing and the job is simply redone).
async function nextDue() {
  const [{ data: queued }, { data: running }] = await Promise.all([
    supabaseAdmin.from("knowledge_jobs").select("run_after").eq("status", "queued").order("run_after").limit(1).maybeSingle(),
    supabaseAdmin
      .from("knowledge_jobs")
      .select("locked_until")
      .eq("status", "running")
      .order("locked_until")
      .limit(1)
      .maybeSingle(),
  ]);
  const times = [queued?.run_after, running?.locked_until].filter(Boolean).map((at) => new Date(at as string).getTime());
  return times.length > 0 ? Math.min(...times) : null;
}

// Works until nothing is left or time is nearly up. Waits for retries that
// come due before then. Returns whether work remains for another run.
export async function runKnowledgeWorker(deadline: number) {
  const renderer = new PageRenderer(2);
  try {
    while (Date.now() < deadline) {
      const { data } = await supabaseAdmin.rpc("claim_knowledge_jobs", { p_limit: CLAIM_SIZE, p_lease_seconds: LEASE_SECONDS });
      const jobs = (data ?? []) as Job[];
      if (jobs.length > 0) {
        await inBatches(jobs, CONCURRENCY, (job) => runJob(job, renderer));
        continue;
      }
      const due = await nextDue();
      if (due === null || due > deadline - 5_000) break;
      await new Promise((resolve) => setTimeout(resolve, Math.max(1_000, due - Date.now())));
    }
  } finally {
    await renderer.close();
    await supabaseAdmin.rpc("settle_knowledge_imports");
  }
  return { more: (await nextDue()) !== null };
}
