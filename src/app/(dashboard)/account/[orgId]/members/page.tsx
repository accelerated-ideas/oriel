import type { Metadata } from "next";
import Link from "next/link";
import { IS_CLOUD } from "@/config/edition";
import { requireOrgPage } from "@/lib/auth/access";
import { getWorkspaceBilling } from "@/lib/billing/limits";
import { planState } from "@/lib/billing/plan-state";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { invitationLink } from "@/lib/workspaces/invitations";
import { PageBody } from "@/components/dashboard/app-shell";
import { WorkspaceShell } from "@/components/dashboard/workspace-shell";
import { PageHeader } from "@/components/ui/misc";
import type { OrganizationRole } from "@/lib/types";
import { InviteButton, MembersBody } from "./members-body";

export const metadata: Metadata = { title: "Members" };
export const dynamic = "force-dynamic";

export default async function MembersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const context = await requireOrgPage(orgId);
  const canManage = context.membership.role !== "member";

  const [{ data: memberRows }, { data: invitationRows }, workspace] = await Promise.all([
    supabaseAdmin
      .from("users_organizations")
      .select("user_id, role, created_at, users(email)")
      .eq("organization_id", orgId)
      .order("created_at"),
    supabaseAdmin
      .from("organization_invitations")
      .select("id, email, role, token, created_at, expires_at")
      .eq("organization_id", orgId)
      .order("created_at"),
    IS_CLOUD ? getWorkspaceBilling(orgId) : null,
  ]);

  const members = (memberRows ?? []).map((row) => ({
    userId: row.user_id as string,
    email: (row.users as unknown as { email: string | null } | null)?.email ?? "Unknown",
    role: row.role as OrganizationRole,
    joinedAt: row.created_at as string,
  }));
  const invitations = (invitationRows ?? []).map((row) => ({
    id: row.id as string,
    email: row.email as string,
    role: row.role as "admin" | "member",
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    // Only managers can see and share links.
    link: canManage ? invitationLink(row.token as string) : null,
  }));

  const state = workspace ? planState(workspace) : null;
  const seats = state ? state.plan.includes.seats : null;
  const used = members.length + invitations.filter((invitation) => new Date(invitation.expiresAt) > new Date()).length;

  return (
    <WorkspaceShell context={context}>
      <PageBody>
        <PageHeader
          title="Members"
          description={
            seats !== null && state ? (
              <>
                {used} of {seats} seats used on the {state.kind === "trial" ? "trial" : `${state.plan.name} plan`}.{" "}
                {used >= seats && canManage && (
                  <Link href={`/account/${orgId}/billing`} className="font-medium text-accent-ink hover:underline">
                    Upgrade for more
                  </Link>
                )}
              </>
            ) : (
              `Everyone who works on ${context.membership.organization.name}'s assistants.`
            )
          }
          actions={canManage ? <InviteButton organizationId={orgId} /> : undefined}
        />
        <MembersBody
          organizationId={orgId}
          currentUserId={context.user.id}
          canManage={canManage}
          members={members}
          invitations={invitations}
        />
      </PageBody>
    </WorkspaceShell>
  );
}
