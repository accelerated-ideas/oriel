import "server-only";
import { IS_CLOUD } from "@/config/edition";
import { SITE_MAP_MAX_PAGES } from "@/lib/site-map/pages";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Agent } from "@/lib/types";
import { messageAllowance, planState, WORKSPACE_BILLING_COLUMNS, type PlanState, type WorkspaceBilling } from "./plan-state";

// Plan limits. Only the cloud edition has any: self-hosted installs are unlimited.

export async function getWorkspaceBilling(organizationId: string) {
  const { data } = await supabaseAdmin
    .from("organizations")
    .select(WORKSPACE_BILLING_COLUMNS)
    .eq("id", organizationId)
    .maybeSingle();
  return (data as WorkspaceBilling | null) ?? null;
}

export async function countMembers(organizationId: string) {
  const [{ count: members }, { count: invitations }] = await Promise.all([
    supabaseAdmin.from("users_organizations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabaseAdmin
      .from("organization_invitations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gt("expires_at", new Date().toISOString()),
  ]);
  return { members: members ?? 0, invitations: invitations ?? 0 };
}

export async function countAssistants(organizationId: string) {
  const { count } = await supabaseAdmin
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  return count ?? 0;
}

type Check = { ok: true } | { ok: false; error: string };

// Before creating an assistant or inviting someone.
export async function checkRoomFor(organizationId: string, what: "assistant" | "seat"): Promise<Check> {
  if (!IS_CLOUD) return { ok: true };
  const workspace = await getWorkspaceBilling(organizationId);
  if (!workspace) return { ok: false, error: "This workspace no longer exists." };
  const state = planState(workspace);
  if (state.kind === "inactive") {
    return { ok: false, error: "Choose a plan on the Billing page to keep going." };
  }
  if (what === "assistant") {
    const limit = state.plan.includes.assistants;
    if ((await countAssistants(organizationId)) >= limit) {
      return { ok: false, error: `Your plan includes ${limit === 1 ? "1 assistant" : `${limit} assistants`}. Upgrade on the Billing page for more.` };
    }
  } else {
    const limit = state.plan.includes.seats;
    const { members, invitations } = await countMembers(organizationId);
    if (members + invitations >= limit) {
      return { ok: false, error: `Your plan includes ${limit} team members, counting invitations. Upgrade on the Billing page for more.` };
    }
  }
  return { ok: true };
}

// How many more knowledge characters a workspace can add, or null when there's
// no limit (self-hosted). `excluding` leaves out a source being re-indexed.
export async function knowledgeRoom(organizationId: string, excluding?: string): Promise<number | null> {
  if (!IS_CLOUD) return null;
  const workspace = await getWorkspaceBilling(organizationId);
  if (!workspace) return 0;
  const state = planState(workspace);
  if (state.kind === "inactive") return 0;
  const { data } = await supabaseAdmin.rpc("knowledge_characters_used", {
    p_organization_id: organizationId,
    p_excluding: excluding ?? null,
  });
  return Math.max(0, state.plan.includes.knowledge_characters - Number(data ?? 0));
}

// Pages each of the workspace's assistants can have in its site map. 0 while
// the workspace has no active plan.
export async function siteMapLimit(organizationId: string): Promise<number> {
  if (!IS_CLOUD) return SITE_MAP_MAX_PAGES;
  const workspace = await getWorkspaceBilling(organizationId);
  const state = workspace ? planState(workspace) : null;
  if (!state || state.kind === "inactive") return 0;
  return Math.min(SITE_MAP_MAX_PAGES, state.plan.includes.site_map_pages);
}

// How often website pages may be re-read. Self-hosted: whenever the owner
// likes, and automatically every KNOWLEDGE_AUTO_REFRESH_DAYS (default 7, 0 = off).
export type RefreshPolicy = { everyHours: number; autoDays: number | null };

export async function refreshPolicy(organizationId: string): Promise<RefreshPolicy> {
  if (!IS_CLOUD) {
    const days = Number(process.env.KNOWLEDGE_AUTO_REFRESH_DAYS ?? 7);
    return { everyHours: 0, autoDays: Number.isFinite(days) && days > 0 ? days : null };
  }
  const workspace = await getWorkspaceBilling(organizationId);
  const state = workspace ? planState(workspace) : null;
  if (!state || state.kind === "inactive") return { everyHours: 24 * 7, autoDays: null };
  return { everyHours: state.plan.includes.refresh_every_hours, autoDays: state.plan.includes.auto_refresh_days };
}

// Whether a workspace's plan lets its assistants hide "Powered by Oriel".
export async function canRemoveBranding(organizationId: string): Promise<boolean> {
  if (!IS_CLOUD) return true;
  const workspace = await getWorkspaceBilling(organizationId);
  const state = workspace ? planState(workspace) : null;
  return Boolean(state && state.kind !== "inactive" && state.plan.includes.remove_branding);
}

// Whether the widget shows "Powered by Oriel": unless the owner turned it off
// and their plan allows that, so it comes back after a downgrade.
export async function showsBranding(agent: Pick<Agent, "show_branding" | "organization_id">) {
  return agent.show_branding || !(await canRemoveBranding(agent.organization_id));
}

// Whether a workspace's assistants may answer visitors right now. Cached
// briefly: it runs on every message, and a few over the limit don't matter.
const answerCache = new Map<string, { result: AnswerCheck; at: number }>();
const ANSWER_CACHE_MS = 15_000;

export type AnswerCheck = { ok: true } | { ok: false; reason: "inactive" | "message-limit" };

export async function canAnswer(organizationId: string): Promise<AnswerCheck> {
  if (!IS_CLOUD) return { ok: true };
  const cached = answerCache.get(organizationId);
  if (cached && Date.now() - cached.at < ANSWER_CACHE_MS) return cached.result;

  let result: AnswerCheck = { ok: true };
  const workspace = await getWorkspaceBilling(organizationId);
  const state: PlanState | null = workspace ? planState(workspace) : null;
  if (!workspace || !state || state.kind === "inactive") {
    result = { ok: false, reason: "inactive" };
  } else {
    if (messageAllowance(workspace, state).left <= 0) result = { ok: false, reason: "message-limit" };
  }

  answerCache.set(organizationId, { result, at: Date.now() });
  if (answerCache.size > 5000) answerCache.clear();
  return result;
}

// What a visitor sees when the assistant can't answer.
export const UNAVAILABLE_MESSAGE = "This assistant isn't available right now. Please try again later.";
