import { after, NextResponse, type NextRequest } from "next/server";
import { queueAutomaticRefresh, wakeWorker, workerSecret } from "@/lib/knowledge/queue";
import { runKnowledgeWorker } from "@/lib/knowledge/worker";
import { keepConnectionsAlive } from "@/lib/integrations/keep-alive";

export const dynamic = "force-dynamic";
// Each run works for up to ~4 minutes and then hands over to a fresh run, so
// big imports never depend on one long request. 300s works on every Vercel plan.
export const maxDuration = 300;
const WORK_MS = (maxDuration - 45) * 1000;

function authorized(request: NextRequest) {
  return request.headers.get("authorization") === `Bearer ${workerSecret()}`;
}

function work() {
  const deadline = Date.now() + WORK_MS;
  after(async () => {
    const { more } = await runKnowledgeWorker(deadline);
    if (more) await wakeWorker();
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}

// Woken when work is queued (and by a run that ran out of time).
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return work();
}

// Vercel Cron, daily: queue website pages due for automatic refresh on each
// workspace's plan (unchanged pages cost one fetch, nothing more), keep
// integration tokens from expiring unused, then work.
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await queueAutomaticRefresh();
  after(() => keepConnectionsAlive());
  return work();
}
