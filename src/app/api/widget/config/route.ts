import { NextResponse, type NextRequest } from "next/server";
import { canAnswer, showsBranding } from "@/lib/billing/limits";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { publicAgentConfig } from "@/lib/widget/public-agent";
import type { Agent } from "@/lib/types";

export const dynamic = "force-dynamic";

const CORS = { "access-control-allow-origin": "*", "cache-control": "public, max-age=60" };

// Launcher appearance for the embed script (public, no secrets).
export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(agentId)) return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });

  const { data } = await supabaseAdmin.from("agents").select("*").eq("id", agentId).maybeSingle();
  const agent = data as Agent | null;
  const preview = request.nextUrl.searchParams.get("preview") === "1";
  if (!agent || (!agent.is_live && !preview)) return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  // Without an active plan (or with this month's messages used up) the launcher stays hidden.
  if (!preview && !(await canAnswer(agent.organization_id)).ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS });
  }

  return NextResponse.json(publicAgentConfig(agent, { branding: await showsBranding(agent) }), { headers: CORS });
}
