"use server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { authorizeAgent } from "@/lib/auth/access";
import type { ActionResult } from "@/lib/types";

export async function actionSetInsightStatus(
  agentId: string,
  insightId: string,
  status: "open" | "resolved",
): Promise<ActionResult> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  await supabaseAdmin.from("insights").update({ status }).eq("id", insightId).eq("agent_id", agentId);
  revalidatePath(`/account/${access.agent.organization_id}/agents/${agentId}/insights`);
  return { ok: true };
}
