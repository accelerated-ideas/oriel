import "server-only";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { insertMessages } from "@/lib/runtime/history";

export const pageLinksSchema = z.array(z.object({ text: z.string().max(200), url: z.string().max(2000) })).max(60);

export const pageSchema = z.object({
  url: z.string().max(2000),
  title: z.string().max(500).nullish(),
  text: z.string().max(20_000).nullish(),
  links: pageLinksSchema.nullish(),
});

export type PageSnapshot = z.infer<typeof pageSchema>;

// Records the page the visitor is on. A new address also goes into the
// transcript ("Opened …"); the same address with new content (a single-page
// app that rendered after its URL changed) just refreshes what the assistant
// sees. Returns the page's URL.
export async function recordPage(session: { conversationId: string; agentId: string; pageUrl: string | null }, page: PageSnapshot) {
  const { data: agent } = await supabaseAdmin.from("agents").select("share_page_content").eq("id", session.agentId).single();
  await supabaseAdmin
    .from("conversations")
    .update({
      page_url: page.url,
      page_title: page.title ?? null,
      page_text: agent?.share_page_content ? (page.text ?? null) : null,
      page_links: agent?.share_page_content ? (page.links ?? null) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.conversationId);
  if (page.url !== session.pageUrl) {
    await insertMessages([
      { conversation_id: session.conversationId, role: "event", content: `Opened ${page.title || page.url}`, page_url: page.url },
    ]);
  }
  return page.url;
}
