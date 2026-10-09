import "server-only";
import { appUrl, BRAND } from "@/config/brand";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type Invitation = {
  id: string;
  organization_id: string;
  email: string;
  role: "admin" | "member";
  token: string;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
};

export const invitationLink = (token: string) => appUrl(`/invite/${token}`);

export function invitationEmail({ workspace, inviter, link }: { workspace: string; inviter: string; link: string }) {
  return {
    subject: `${inviter} invited you to ${workspace} on ${BRAND.name}`,
    text: [
      `${inviter} invited you to join ${workspace} on ${BRAND.name}.`,
      "",
      `Accept the invitation: ${link}`,
      "",
      "The link works for 14 days. If you weren't expecting this, you can ignore it.",
    ].join("\n"),
  };
}

export async function findInvitation(token: string) {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const { data } = await supabaseAdmin
    .from("organization_invitations")
    .select("*, organizations(name)")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  const { organizations, ...invitation } = data as Invitation & { organizations: { name: string } | null };
  return { invitation: invitation as Invitation, workspaceName: organizations?.name ?? "a workspace" };
}

// Open invitations for an email, for the "you're invited" notice in the dashboard.
export async function invitationsFor(email: string) {
  const { data } = await supabaseAdmin
    .from("organization_invitations")
    .select("id, token, role, organizations(id, name)")
    .eq("email", email.toLowerCase())
    .gt("expires_at", new Date().toISOString())
    .order("created_at");
  return (data ?? []).flatMap((row) => {
    const organization = row.organizations as unknown as { id: string; name: string } | null;
    return organization ? [{ id: row.id as string, token: row.token as string, workspace: organization }] : [];
  });
}

export function isExpired(invitation: Invitation) {
  return new Date(invitation.expires_at) < new Date();
}
