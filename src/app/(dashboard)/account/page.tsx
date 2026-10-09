import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/get-user";
import { getMemberships } from "@/lib/auth/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { invitationsFor } from "@/lib/workspaces/invitations";
import { defaultWorkspaceName } from "@/lib/workspaces/naming";

// Where sign-in lands. Opens the first workspace; someone with none gets
// their invitation, or else a workspace of their own.
export default async function AccountPage() {
  const user = await getUser();
  if (!user) redirect("/auth");

  const memberships = await getMemberships(user.id);
  if (memberships.length > 0) redirect(`/account/${memberships[0].organization.id}/agents`);

  const [invitation] = user.email ? await invitationsFor(user.email) : [];
  if (invitation) redirect(`/invite/${invitation.token}`);

  const { data: organizationId, error } = await supabaseAdmin.rpc("ensure_personal_organization", {
    p_user_id: user.id,
    p_name: defaultWorkspaceName(user.email),
  });
  if (error || !organizationId) throw error ?? new Error("Couldn't create a workspace");
  redirect(`/account/${organizationId}/agents`);
}
