"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeOrg } from "@/lib/auth/access";
import { getUser } from "@/lib/auth/get-user";
import { checkRoomFor } from "@/lib/billing/limits";
import { randomToken } from "@/lib/crypto";
import { sendEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { findInvitation, invitationEmail, invitationLink, isExpired } from "@/lib/workspaces/invitations";
import type { ActionResult } from "@/lib/types";

const uuid = z.string().uuid();
const workspaceName = z.string().trim().min(1, "Give it a name").max(60, "Keep the name under 60 characters");

const failure = (scope: string, error: unknown, message: string): { ok: false; error: string } => {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0].message };
  console.error(scope, error);
  return { ok: false, error: message };
};

async function requireManager(organizationId: string) {
  const access = await authorizeOrg(organizationId);
  if (!access.ok) return access;
  if (access.role === "member") return { ok: false as const, error: "Only owners and admins can do that." };
  return access;
}

// ---------- workspaces ----------

export async function actionCreateWorkspace(input: { name: string }): Promise<ActionResult<{ id: string }>> {
  try {
    const name = workspaceName.parse(input.name);
    const user = await getUser();
    if (!user) return { ok: false, error: "You're signed out. Sign in and try again." };
    const { data, error } = await supabaseAdmin.rpc("create_organization", { p_user_id: user.id, p_name: name });
    if (error || !data) throw error ?? new Error("No workspace returned");
    return { ok: true, data: { id: data as string } };
  } catch (error) {
    return failure("actionCreateWorkspace", error, "Couldn't create the workspace.");
  }
}

export async function actionRenameWorkspace(input: { organizationId: string; name: string }): Promise<ActionResult> {
  try {
    const organizationId = uuid.parse(input.organizationId);
    const name = workspaceName.parse(input.name);
    const access = await requireManager(organizationId);
    if (!access.ok) return access;
    await supabaseAdmin.from("organizations").update({ name }).eq("id", organizationId).throwOnError();
    revalidatePath(`/account/${organizationId}`, "layout");
    return { ok: true };
  } catch (error) {
    return failure("actionRenameWorkspace", error, "Couldn't rename the workspace.");
  }
}

// ---------- members ----------

const inviteSchema = z.object({
  organizationId: uuid,
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: z.enum(["admin", "member"]),
});

export async function actionInviteMember(
  input: z.input<typeof inviteSchema>,
): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  try {
    const data = inviteSchema.parse(input);
    const access = await requireManager(data.organizationId);
    if (!access.ok) return access;

    const { data: existingUser } = await supabaseAdmin.from("users").select("id").eq("email", data.email).maybeSingle();
    if (existingUser) {
      const { data: membership } = await supabaseAdmin
        .from("users_organizations")
        .select("id")
        .eq("organization_id", data.organizationId)
        .eq("user_id", existingUser.id)
        .maybeSingle();
      if (membership) return { ok: false, error: "They're already in this workspace." };
    }

    // Inviting the same email again refreshes the invitation instead of adding a seat.
    const { data: pending } = await supabaseAdmin
      .from("organization_invitations")
      .select("id, token")
      .eq("organization_id", data.organizationId)
      .eq("email", data.email)
      .maybeSingle();
    let token = pending?.token as string | undefined;
    const expiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
    if (pending) {
      await supabaseAdmin
        .from("organization_invitations")
        .update({ role: data.role, expires_at: expiresAt, invited_by: access.user.id })
        .eq("id", pending.id)
        .throwOnError();
    } else {
      const room = await checkRoomFor(data.organizationId, "seat");
      if (!room.ok) return room;
      token = randomToken(24);
      await supabaseAdmin
        .from("organization_invitations")
        .insert({
          organization_id: data.organizationId,
          email: data.email,
          role: data.role,
          token,
          invited_by: access.user.id,
          expires_at: expiresAt,
        })
        .throwOnError();
    }

    const { data: workspace } = await supabaseAdmin.from("organizations").select("name").eq("id", data.organizationId).single();
    const link = invitationLink(token!);
    const emailed = await sendEmail({
      to: data.email,
      replyTo: access.user.email,
      ...invitationEmail({ workspace: workspace?.name ?? "a workspace", inviter: access.user.email ?? "A teammate", link }),
    });

    revalidatePath(`/account/${data.organizationId}/members`);
    return { ok: true, data: { link, emailed } };
  } catch (error) {
    return failure("actionInviteMember", error, "Couldn't send the invitation.");
  }
}

export async function actionRevokeInvitation(input: { organizationId: string; invitationId: string }): Promise<ActionResult> {
  try {
    const organizationId = uuid.parse(input.organizationId);
    const access = await requireManager(organizationId);
    if (!access.ok) return access;
    await supabaseAdmin
      .from("organization_invitations")
      .delete()
      .eq("id", uuid.parse(input.invitationId))
      .eq("organization_id", organizationId)
      .throwOnError();
    revalidatePath(`/account/${organizationId}/members`);
    return { ok: true };
  } catch (error) {
    return failure("actionRevokeInvitation", error, "Couldn't revoke the invitation.");
  }
}

export async function actionChangeMemberRole(input: {
  organizationId: string;
  userId: string;
  role: "admin" | "member";
}): Promise<ActionResult> {
  try {
    const organizationId = uuid.parse(input.organizationId);
    const role = z.enum(["admin", "member"]).parse(input.role);
    const access = await requireManager(organizationId);
    if (!access.ok) return access;
    const { data: target } = await supabaseAdmin
      .from("users_organizations")
      .select("id, role")
      .eq("organization_id", organizationId)
      .eq("user_id", uuid.parse(input.userId))
      .maybeSingle();
    if (!target) return { ok: false, error: "They're no longer in this workspace." };
    if (target.role === "owner") return { ok: false, error: "The owner's role can't be changed." };
    await supabaseAdmin.from("users_organizations").update({ role }).eq("id", target.id).throwOnError();
    revalidatePath(`/account/${organizationId}/members`);
    return { ok: true };
  } catch (error) {
    return failure("actionChangeMemberRole", error, "Couldn't change their role.");
  }
}

// Removes someone, or lets a member leave (userId = themselves).
export async function actionRemoveMember(input: { organizationId: string; userId: string }): Promise<ActionResult> {
  try {
    const organizationId = uuid.parse(input.organizationId);
    const userId = uuid.parse(input.userId);
    const access = await authorizeOrg(organizationId);
    if (!access.ok) return access;
    const leaving = userId === access.user.id;
    if (!leaving && access.role === "member") return { ok: false, error: "Only owners and admins can do that." };

    const { data: target } = await supabaseAdmin
      .from("users_organizations")
      .select("id, role")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!target) return { ok: true };
    if (target.role === "owner") {
      return { ok: false, error: leaving ? "Owners can't leave their own workspace." : "The owner can't be removed." };
    }
    await supabaseAdmin.from("users_organizations").delete().eq("id", target.id).throwOnError();
    revalidatePath(`/account/${organizationId}/members`);
    return { ok: true };
  } catch (error) {
    return failure("actionRemoveMember", error, "Couldn't remove them.");
  }
}

// ---------- accepting invitations ----------

export async function actionAcceptInvitation(input: { token: string }): Promise<ActionResult<{ organizationId: string }>> {
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "You're signed out. Sign in and try again." };
    const found = await findInvitation(String(input.token));
    if (!found || isExpired(found.invitation)) return { ok: false, error: "This invitation has expired. Ask for a new one." };
    const { invitation } = found;
    if (invitation.email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
      return { ok: false, error: `This invitation is for ${invitation.email}.` };
    }

    const { error } = await supabaseAdmin
      .from("users_organizations")
      .upsert(
        { user_id: user.id, organization_id: invitation.organization_id, role: invitation.role },
        { onConflict: "user_id,organization_id", ignoreDuplicates: true },
      );
    if (error) throw error;
    await supabaseAdmin.from("organization_invitations").delete().eq("id", invitation.id);
    return { ok: true, data: { organizationId: invitation.organization_id } };
  } catch (error) {
    return failure("actionAcceptInvitation", error, "Couldn't join the workspace.");
  }
}

export async function actionDeclineInvitation(input: { invitationId: string }): Promise<ActionResult> {
  try {
    const user = await getUser();
    if (!user?.email) return { ok: false, error: "You're signed out. Sign in and try again." };
    await supabaseAdmin
      .from("organization_invitations")
      .delete()
      .eq("id", uuid.parse(input.invitationId))
      .eq("email", user.email.toLowerCase())
      .throwOnError();
    revalidatePath("/account", "layout");
    return { ok: true };
  } catch (error) {
    return failure("actionDeclineInvitation", error, "Couldn't decline the invitation.");
  }
}
