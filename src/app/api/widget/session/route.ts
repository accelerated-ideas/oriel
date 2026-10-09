import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appUrl } from "@/config/brand";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { signSession } from "@/lib/crypto";
import { verifyIdentityToken, type VerifiedIdentity } from "@/lib/identity";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { originAllowed, publicAgentConfig } from "@/lib/widget/public-agent";
import { showsBranding } from "@/lib/billing/limits";
import { getUser } from "@/lib/auth/get-user";
import { pageLinksSchema, recordPage } from "@/lib/widget/page";
import type { Agent, Conversation, MessageRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const CONVERSATION_IDLE_HOURS = 12;

const bodySchema = z.object({
  agentId: z.string().uuid(),
  visitorId: z.string().min(8).max(100),
  conversationId: z.string().uuid().nullish(),
  hostOrigin: z.string().max(300).nullish(),
  page: z
    .object({
      url: z.string().max(2000).nullish(),
      title: z.string().max(500).nullish(),
      text: z.string().max(20_000).nullish(),
      links: pageLinksSchema.nullish(),
      referrer: z.string().max(2000).nullish(),
    })
    .nullish(),
  identity: z
    .object({
      token: z.string().max(8000).nullish(),
      name: z.string().max(200).nullish(),
      email: z.string().max(320).nullish(),
    })
    .nullish(),
  preview: z.boolean().nullish(),
  // The visitor's IANA time zone, from their browser.
  timeZone: z.string().max(64).nullish(),
});

function validTimeZone(value: string | null | undefined) {
  if (!value) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

function displayMessages(rows: Pick<MessageRow, "id" | "role" | "content" | "tool_name" | "tool_target">[]) {
  return rows
    .filter((row) => (row.role === "user" || row.role === "assistant") && row.content.trim())
    .map((row) => ({ id: row.id, role: row.role as "user" | "assistant", content: row.content }));
}

async function isWorkspaceMember(organizationId: string) {
  const user = await getUser();
  if (!user) return false;
  const { data } = await supabaseAdmin
    .from("users_organizations")
    .select("id")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return Boolean(data);
}

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;

  if (!(await rateLimit(`session:${clientIp(request)}`, 30, "1 m"))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { data: agentRow } = await supabaseAdmin.from("agents").select("*").eq("id", body.agentId).maybeSingle();
  const agent = agentRow as Agent | null;
  const hostOrigin = body.hostOrigin ?? null;
  const appOrigin = new URL(appUrl()).origin;
  if (!agent) return NextResponse.json({ error: "This assistant isn't available." }, { status: 404 });
  // A preview only counts as one for a signed-in member of the assistant's
  // workspace; unpublished assistants can only be previewed by them.
  const preview = Boolean(body.preview) && (await isWorkspaceMember(agent.organization_id));
  if (!agent.is_live && !preview) {
    return NextResponse.json({ error: "This assistant is turned off." }, { status: 404 });
  }

  if (!originAllowed(agent, hostOrigin, appOrigin)) {
    return NextResponse.json({ error: "This site isn't allowed to use this assistant." }, { status: 403 });
  }

  let identity: VerifiedIdentity | null = null;
  if (body.identity?.token) identity = await verifyIdentityToken(body.identity.token, agent.identity_secret);

  const identityFields = identity
    ? {
        user_verified: true,
        user_external_id: identity.externalId,
        user_email: identity.email,
        user_name: identity.name,
        user_attributes: identity.attributes,
        stripe_customer_id: identity.stripeCustomerId,
      }
    : {
        user_verified: false,
        user_external_id: null,
        stripe_customer_id: null,
        ...(body.identity?.email ? { user_email: body.identity.email } : {}),
        ...(body.identity?.name ? { user_name: body.identity.name } : {}),
      };

  const timeZone = validTimeZone(body.timeZone);
  const timeZoneField = timeZone ? { time_zone: timeZone } : {};
  const pageFields = {
    page_url: body.page?.url ?? null,
    page_title: body.page?.title ?? null,
    page_text: agent.share_page_content ? (body.page?.text ?? null) : null,
    page_links: agent.share_page_content ? (body.page?.links ?? null) : null,
    ...timeZoneField,
  };

  let conversation: Conversation | null = null;
  if (body.conversationId) {
    const { data } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("id", body.conversationId)
      .eq("agent_id", agent.id)
      .eq("visitor_id", body.visitorId)
      .maybeSingle();
    const existing = data as Conversation | null;
    const lastActivity = existing ? new Date(existing.last_message_at ?? existing.created_at).getTime() : 0;
    const fresh = Date.now() - lastActivity < CONVERSATION_IDLE_HOURS * 3600 * 1000;
    // A signed-in user must never inherit another identity's conversation.
    const sameUser = !existing?.user_verified || existing.user_external_id === identity?.externalId;
    if (existing && fresh && sameUser) {
      // A full page load mid-conversation is a move like any other: it goes
      // into the transcript ("Opened …").
      if (body.page?.url) {
        await recordPage(
          { conversationId: existing.id, agentId: agent.id, pageUrl: existing.page_url },
          { url: body.page.url, title: body.page.title, text: body.page.text, links: body.page.links },
        );
      }
      const { data: updated } = await supabaseAdmin
        .from("conversations")
        .update({
          ...timeZoneField,
          ...identityFields,
          is_preview: preview,
          status: "active",
          ended_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      conversation = updated as Conversation;
    }
  }

  let created = false;
  if (!conversation) {
    const { data: inserted, error } = await supabaseAdmin
      .from("conversations")
      .insert({
        agent_id: agent.id,
        organization_id: agent.organization_id,
        visitor_id: body.visitorId,
        host_origin: hostOrigin,
        referrer: body.page?.referrer ?? null,
        user_agent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
        country: request.headers.get("x-vercel-ip-country") ?? null,
        is_preview: preview,
        ...pageFields,
        ...identityFields,
      })
      .select("*")
      .single();
    if (error || !inserted) {
      console.error("Failed to create conversation", error);
      return NextResponse.json({ error: "Couldn't start a conversation" }, { status: 500 });
    }
    conversation = inserted as Conversation;
    created = true;
    await supabaseAdmin.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: agent.greeting,
      page_url: pageFields.page_url,
    });
  }

  const { data: rows } = await supabaseAdmin
    .from("messages")
    .select("id, role, content, tool_name, tool_target")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(80);

  return NextResponse.json({
    sessionToken: signSession({ conversationId: conversation.id, agentId: agent.id }),
    conversationId: conversation.id,
    created,
    agent: publicAgentConfig(agent, { branding: await showsBranding(agent) }),
    user: { verified: conversation.user_verified, name: conversation.user_name },
    messages: displayMessages((rows ?? []) as MessageRow[]),
  });
}
