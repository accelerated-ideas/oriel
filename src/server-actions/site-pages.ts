"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { IS_CLOUD } from "@/config/edition";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { authorizeAgent } from "@/lib/auth/access";
import { siteMapLimit } from "@/lib/billing/limits";
import { discoverPages } from "@/lib/knowledge/discover";
import { cleanLink, SITE_MAP_MAX_PAGES } from "@/lib/site-map/pages";
import { embedSitePages, siteMapSize } from "@/lib/site-map/search";
import type { ActionResult } from "@/lib/types";
import { errorMessage } from "@/lib/utils";
import { reportError } from "@/lib/notify";

const LINK_HINT = "Use a path like /settings/billing or a full URL";

function fullMessage(limit: number) {
  if (limit === 0) return "Choose a plan on the Billing page to keep going.";
  const pages = `${limit.toLocaleString("en-US")} pages`;
  return IS_CLOUD
    ? `Your plan's site map holds ${pages} per assistant. Upgrade on the Billing page for more, or add articles and docs to Knowledge instead.`
    : `The site map holds up to ${pages}. Add articles and docs to Knowledge instead.`;
}

const pageSchema = z.object({
  id: z.string().uuid().nullish(),
  title: z.string().trim().min(1, "Name the page").max(120),
  path: z.string().trim().min(1, "Add the page's path").max(500),
  description: z.string().trim().max(1000).default(""),
  requires_auth: z.boolean().default(false),
});

function sitePath(agentId: string, organizationId: string) {
  return `/account/${organizationId}/agents/${agentId}/site-map`;
}

export async function actionSavePage(agentId: string, input: z.input<typeof pageSchema>): Promise<ActionResult> {
  try {
    const access = await authorizeAgent(agentId);
    if (!access.ok) return access;
    const { id, ...page } = pageSchema.parse(input);
    const path = cleanLink(page.path, access.agent.site_url);
    if (!path) return { ok: false, error: LINK_HINT };

    const { data: same } = await supabaseAdmin.from("site_pages").select("id").eq("agent_id", agentId).eq("path", path).limit(2);
    if ((same ?? []).some((row) => row.id !== id)) return { ok: false, error: "That page is already in the site map." };
    if (!id) {
      const [size, limit] = await Promise.all([siteMapSize(agentId), siteMapLimit(access.agent.organization_id)]);
      if (size.pages >= limit) return { ok: false, error: fullMessage(limit) };
    }

    if (id) {
      await supabaseAdmin
        .from("site_pages")
        .update({ ...page, path, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("agent_id", agentId)
        .throwOnError();
    } else {
      await supabaseAdmin
        .from("site_pages")
        .insert({ ...page, path, agent_id: agentId, organization_id: access.agent.organization_id })
        .throwOnError();
    }
    after(() => embedSitePages(agentId));
    revalidatePath(sitePath(agentId, access.agent.organization_id));
    return { ok: true };
  } catch (error) {
    await reportError("actionSavePage", error, { agent: agentId });
    return { ok: false, error: error instanceof z.ZodError ? error.issues[0].message : "Couldn't save the page." };
  }
}

const importSchema = z.object({
  pages: z.array(pageSchema.omit({ id: true, requires_auth: true })).min(1, "Add at least one link").max(SITE_MAP_MAX_PAGES),
  requiresAuth: z.boolean().default(false),
});

// Adds many pages at once. Pages already in the site map are left as they are.
export async function actionImportPages(
  agentId: string,
  input: z.input<typeof importSchema>,
): Promise<ActionResult<{ added: number; existing: number }>> {
  try {
    const access = await authorizeAgent(agentId);
    if (!access.ok) return access;
    const { pages, requiresAuth } = importSchema.parse(input);

    const fresh = new Map<string, (typeof pages)[number]>();
    for (const page of pages) {
      const path = cleanLink(page.path, access.agent.site_url);
      if (path && !fresh.has(path)) fresh.set(path, { ...page, path });
    }
    let existing = 0;
    const candidates = [...fresh.keys()];
    for (let i = 0; i < candidates.length; i += 1000) {
      const { data, error } = await supabaseAdmin.rpc("existing_site_paths", { p_agent_id: agentId, p_paths: candidates.slice(i, i + 1000) });
      if (error) throw error;
      for (const path of (data ?? []) as string[]) {
        if (fresh.delete(path)) existing++;
      }
    }
    if (fresh.size === 0) return { ok: true, data: { added: 0, existing } };

    const [size, limit] = await Promise.all([siteMapSize(agentId), siteMapLimit(access.agent.organization_id)]);
    if (size.pages + fresh.size > limit) {
      const room = Math.max(0, limit - size.pages);
      const count = fresh.size.toLocaleString("en-US");
      return {
        ok: false,
        error: room > 0 ? `That's ${count} new pages and there's room for ${room.toLocaleString("en-US")}. ${fullMessage(limit)}` : fullMessage(limit),
      };
    }

    const rows = [...fresh.values()].map((page) => ({
      ...page,
      requires_auth: requiresAuth,
      agent_id: agentId,
      organization_id: access.agent.organization_id,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      await supabaseAdmin.from("site_pages").insert(rows.slice(i, i + 500)).throwOnError();
    }
    after(() => embedSitePages(agentId));
    revalidatePath(sitePath(agentId, access.agent.organization_id));
    return { ok: true, data: { added: rows.length, existing } };
  } catch (error) {
    await reportError("actionImportPages", error, { agent: agentId });
    return { ok: false, error: error instanceof z.ZodError ? error.issues[0].message : "Couldn't add the pages." };
  }
}

// The links a sitemap lists (and the sitemaps it points to), for the import panel.
export async function actionReadSitemap(
  agentId: string,
  input: { url: string; startsWith?: string },
): Promise<ActionResult<{ links: string[] }>> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  let url: URL;
  try {
    url = new URL(input.url.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
  } catch {
    return { ok: false, error: "Enter the sitemap's full address, like https://www.example.com/sitemap.xml." };
  }
  // A site's address: look for its sitemap.
  if (url.pathname === "/") url = new URL("/sitemap.xml", url.origin);
  try {
    const prefix = (input.startsWith ?? "").trim();
    const found = await discoverPages(url.toString(), SITE_MAP_MAX_PAGES, null, { mode: "sitemap" });
    if (found.length === 0) return { ok: false, error: "No pages found. Check the sitemap's address." };
    const links = found.filter((link) => !prefix || new URL(link).pathname.startsWith(prefix));
    if (links.length === 0) return { ok: false, error: `None of the ${found.length.toLocaleString("en-US")} pages start with ${prefix}.` };
    return { ok: true, data: { links } };
  } catch (error) {
    return { ok: false, error: `Couldn't read the sitemap: ${errorMessage(error)}` };
  }
}

export async function actionDeletePage(agentId: string, pageId: string): Promise<ActionResult> {
  return actionDeletePages(agentId, [pageId]);
}

export async function actionDeletePages(agentId: string, pageIds: string[]): Promise<ActionResult> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  const ids = z.array(z.string().uuid()).max(SITE_MAP_MAX_PAGES).safeParse(pageIds);
  if (!ids.success) return { ok: false, error: "Couldn't remove those pages." };
  for (let i = 0; i < ids.data.length; i += 200) {
    await supabaseAdmin.from("site_pages").delete().eq("agent_id", agentId).in("id", ids.data.slice(i, i + 200));
  }
  revalidatePath(sitePath(agentId, access.agent.organization_id));
  return { ok: true };
}

// Removes every page, or every page matching a search on the Site map page.
export async function actionDeleteMatchingPages(agentId: string, search: string): Promise<ActionResult> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  let query = supabaseAdmin.from("site_pages").delete().eq("agent_id", agentId);
  const text = search.trim().slice(0, 100);
  if (text) {
    const pattern = `%${text.replace(/[,()%*\\]/g, " ")}%`;
    query = query.or(`title.ilike.${pattern},path.ilike.${pattern},description.ilike.${pattern}`);
  }
  const { error } = await query;
  if (error) return { ok: false, error: "Couldn't remove the pages." };
  revalidatePath(sitePath(agentId, access.agent.organization_id));
  return { ok: true };
}
