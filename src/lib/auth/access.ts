import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth/get-user";
import type { Agent, OrganizationRole } from "@/lib/types";

export type Membership = {
  organization: { id: string; name: string };
  role: OrganizationRole;
};

export async function getMemberships(userId: string): Promise<Membership[]> {
  const { data } = await supabaseAdmin
    .from("users_organizations")
    .select("role, organizations(id, name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  return (data ?? [])
    .filter((row) => row.organizations)
    .map((row) => ({
      role: row.role as OrganizationRole,
      organization: row.organizations as unknown as { id: string; name: string },
    }));
}

// Page guard: resolves the signed-in user and their membership of `orgId`,
// redirecting when either is missing.
export async function requireOrgPage(orgId: string) {
  const user = await getUser();
  if (!user) redirect("/auth");

  const memberships = await getMemberships(user.id);
  const membership = memberships.find((m) => m.organization.id === orgId);
  if (!membership) redirect("/account");

  return { user, membership, memberships };
}

export async function requireAgentPage(orgId: string, agentId: string) {
  const context = await requireOrgPage(orgId);
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!agent) redirect(`/account/${orgId}/agents`);
  return { ...context, agent: agent as Agent };
}

type AccessResult<T> = { ok: true; user: User } & T;
type AccessError = { ok: false; error: string };

// Server-action guard: never throws, never redirects.
export async function authorizeOrg(orgId: string): Promise<AccessResult<{ role: OrganizationRole }> | AccessError> {
  const user = await getUser();
  if (!user) return { ok: false, error: "You're signed out. Sign in and try again." };

  const { data } = await supabaseAdmin
    .from("users_organizations")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!data) return { ok: false, error: "You don't have access to this workspace." };
  return { ok: true, user, role: data.role as OrganizationRole };
}

export async function authorizeAgent(
  agentId: string,
): Promise<AccessResult<{ role: OrganizationRole; agent: Agent }> | AccessError> {
  const user = await getUser();
  if (!user) return { ok: false, error: "You're signed out. Sign in and try again." };

  const { data: agent } = await supabaseAdmin.from("agents").select("*").eq("id", agentId).maybeSingle();
  if (!agent) return { ok: false, error: "This assistant no longer exists." };

  const { data: membership } = await supabaseAdmin
    .from("users_organizations")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", agent.organization_id)
    .maybeSingle();

  if (!membership) return { ok: false, error: "You don't have access to this assistant." };
  return { ok: true, user, role: membership.role as OrganizationRole, agent: agent as Agent };
}
