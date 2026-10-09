import type { User } from "@supabase/supabase-js";
import { IS_CLOUD } from "@/config/edition";
import type { Membership } from "@/lib/auth/access";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import { getWorkspaceBilling } from "@/lib/billing/limits";
import { planState } from "@/lib/billing/plan-state";
import { AppShell } from "./app-shell";

// What the Billing item in the account menu says about the plan.
async function billingSummary(organizationId: string) {
  if (!IS_CLOUD) return null;
  const workspace = await getWorkspaceBilling(organizationId);
  if (!workspace) return null;
  const state = planState(workspace);
  if (state.kind === "trial") return `Trial, ${state.daysLeft} ${state.daysLeft === 1 ? "day" : "days"} left`;
  if (state.kind === "past-due") return "Payment failed";
  if (state.kind === "inactive") return "No plan";
  return state.plan.name;
}

// The dashboard frame for one workspace (sidebar, account menu, main panel).
export async function WorkspaceShell({
  context,
  currentAgentId,
  children,
}: {
  context: { user: User; membership: Membership; memberships: Membership[] };
  currentAgentId?: string;
  children: React.ReactNode;
}) {
  const { user, membership, memberships } = context;
  return (
    <AppShell
      user={{ id: user.id, email: user.email ?? "" }}
      organization={membership.organization}
      role={membership.role}
      workspaces={memberships.map((m) => m.organization)}
      billing={await billingSummary(membership.organization.id)}
      showCosts={isPlatformAdmin(user.email)}
      currentAgentId={currentAgentId}
    >
      {children}
    </AppShell>
  );
}
