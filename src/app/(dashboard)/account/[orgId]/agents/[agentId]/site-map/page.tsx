import type { Metadata } from "next";
import { after } from "next/server";
import { IS_CLOUD } from "@/config/edition";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAgentPage } from "@/lib/auth/access";
import { siteMapLimit } from "@/lib/billing/limits";
import { embedSitePages, siteMapSize } from "@/lib/site-map/search";
import { PageBody } from "@/components/dashboard/app-shell";
import { PageHeader } from "@/components/ui/misc";
import type { SitePage } from "@/lib/types";
import { SiteMapBody } from "./site-map-body";

export const metadata: Metadata = { title: "Site map" };

const PAGE_SIZE = 100;

export default async function SiteMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; agentId: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { orgId, agentId } = await params;
  const query = await searchParams;
  const { agent } = await requireAgentPage(orgId, agentId);
  const search = (query.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number(query.page) || 1);

  let pagesQuery = supabaseAdmin
    .from("site_pages")
    .select("id, agent_id, organization_id, created_at, title, path, description, requires_auth", { count: "exact" })
    .eq("agent_id", agentId);
  if (search) {
    // PostgREST filter syntax treats these as separators, so they can't be searched for.
    const pattern = `%${search.replace(/[,()%*\\]/g, " ")}%`;
    pagesQuery = pagesQuery.or(`title.ilike.${pattern},path.ilike.${pattern},description.ilike.${pattern}`);
  }
  const [{ data, count }, size, limit, { count: unembedded }] = await Promise.all([
    pagesQuery.order("created_at", { ascending: true }).range(0, page * PAGE_SIZE - 1),
    siteMapSize(agentId),
    siteMapLimit(orgId),
    supabaseAdmin.from("site_pages").select("id", { count: "exact", head: true }).eq("agent_id", agentId).is("embedding", null),
  ]);

  // Pages added before site maps were searchable, or whose embedding failed.
  if (unembedded) after(() => embedSitePages(agentId));

  return (
    <PageBody>
      <PageHeader
        title="Site map"
        description={`The places in your product ${agent.assistant_name} knows about. It uses these to answer “where do I…” and to take people there.`}
      />
      <SiteMapBody
        agentId={agentId}
        pages={(data ?? []) as SitePage[]}
        total={size.pages}
        matching={count ?? 0}
        search={search}
        page={page}
        hasMore={(count ?? 0) > page * PAGE_SIZE}
        limit={limit}
        showLimit={IS_CLOUD}
        siteUrl={agent.site_url ?? ""}
        navigateEnabled={agent.builtin_tools?.navigate !== false}
      />
    </PageBody>
  );
}
