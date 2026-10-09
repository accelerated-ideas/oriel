import type { Metadata } from "next";
import { appUrl } from "@/config/brand";
import { publicPlans } from "@/config/plans";
import { requireAgentPage } from "@/lib/auth/access";
import { canRemoveBranding } from "@/lib/billing/limits";
import { PageBody } from "@/components/dashboard/app-shell";
import { PageHeader } from "@/components/ui/misc";
import { InstallBody } from "./install-body";

export const metadata: Metadata = { title: "Install" };

export default async function InstallPage({ params }: { params: Promise<{ orgId: string; agentId: string }> }) {
  const { orgId, agentId } = await params;
  const { agent } = await requireAgentPage(orgId, agentId);
  const brandingRemovable = await canRemoveBranding(agent.organization_id);

  return (
    <PageBody>
      <PageHeader title="Install" description="Add the bubble to your site, then tell it who's signed in." />
      <InstallBody
        agent={{
          id: agent.id,
          assistant_name: agent.assistant_name,
          accent_color: agent.accent_color,
          avatar_style: agent.avatar_style,
          launcher_label: agent.launcher_label,
          launcher_position: agent.launcher_position,
          show_branding: agent.show_branding,
          allowed_origins: agent.allowed_origins,
          identity_secret: agent.identity_secret,
        }}
        scriptUrl={appUrl("/embed.js")}
        branding={{
          removable: brandingRemovable,
          // The plan to upgrade to, when this one can't remove it.
          plan: publicPlans.find((plan) => plan.includes.remove_branding)?.name ?? null,
          billingHref: `/account/${orgId}/billing`,
        }}
      />
    </PageBody>
  );
}
