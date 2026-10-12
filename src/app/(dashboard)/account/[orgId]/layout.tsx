import { requireOrgPage } from "@/lib/auth/access";
import { WorkspaceShell } from "@/components/dashboard/workspace-shell";

export const dynamic = "force-dynamic";

// The workspace frame (sidebar, account menu, main panel) stays put while its
// pages change, so moving between them only renders the page.
export default async function WorkspaceLayout({
  params,
  children,
}: {
  params: Promise<{ orgId: string }>;
  children: React.ReactNode;
}) {
  const { orgId } = await params;
  const context = await requireOrgPage(orgId);
  return <WorkspaceShell context={context}>{children}</WorkspaceShell>;
}
