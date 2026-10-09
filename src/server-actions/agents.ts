"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { authorizeAgent, authorizeOrg } from "@/lib/auth/access";
import { canRemoveBranding, checkRoomFor } from "@/lib/billing/limits";
import { randomToken } from "@/lib/crypto";
import { AVATAR_STYLES, type AvatarStyle } from "@/config/avatars";
import { BRAND } from "@/config/brand";
import { CHAT_MODELS, CHAT_PROVIDER_NAMES, chatModel, type ChatModelId } from "@/config/ai";
import { isChatModelAvailable } from "@/lib/ai";
import { DEFAULT_VOICE_ID, LANGUAGE_OPTIONS, VOICE_OPTIONS } from "@/config/voices";
import { startImport, wakeWorker } from "@/lib/knowledge/queue";
import { errorMessage, normalizeOrigin } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

const createSchema = z.object({
  organizationId: z.string().uuid(),
  assistantName: z.string().trim().min(1, "Give the assistant a name").max(40),
  siteName: z.string().trim().max(80).default(""),
  siteUrl: z.string().trim().max(300).default(""),
  importSite: z.boolean().default(true),
});

export async function actionCreateAgent(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const data = createSchema.parse(input);
    const access = await authorizeOrg(data.organizationId);
    if (!access.ok) return access;
    const room = await checkRoomFor(data.organizationId, "assistant");
    if (!room.ok) return room;

    let siteUrl = "";
    if (data.siteUrl) {
      const origin = normalizeOrigin(data.siteUrl);
      if (!origin) return { ok: false, error: "That website address doesn't look right." };
      siteUrl = data.siteUrl.includes("://") ? data.siteUrl : `https://${data.siteUrl}`;
    }

    const { data: agent, error } = await supabaseAdmin
      .from("agents")
      .insert({
        organization_id: data.organizationId,
        creator_id: access.user.id,
        assistant_name: data.assistantName,
        site_name: data.siteName,
        site_url: siteUrl,
        voice_id: DEFAULT_VOICE_ID,
        identity_secret: randomToken(32),
        allowed_origins: siteUrl ? [normalizeOrigin(siteUrl)!] : [],
        greeting: `Hi, I'm ${data.assistantName}! I can answer your questions${data.siteName ? ` about ${data.siteName}` : ""} or show you around. What are you trying to do?`,
      })
      .select("id")
      .single();
    if (error || !agent) throw error ?? new Error("Insert failed");

    if (siteUrl && data.importSite) {
      // A first look at the site, added right away so the assistant knows something from the start.
      await startImport({ agentId: agent.id, organizationId: data.organizationId, url: siteUrl, pageLimit: 15, autoAdd: true });
      after(() => wakeWorker());
    }

    revalidatePath(`/account/${data.organizationId}/agents`);
    return { ok: true, data: { id: agent.id } };
  } catch (error) {
    console.error("actionCreateAgent", error);
    return { ok: false, error: error instanceof z.ZodError ? error.issues[0].message : "Couldn't create the assistant." };
  }
}

const updateSchema = z
  .object({
    assistant_name: z.string().trim().min(1, "Give the assistant a name").max(40),
    site_name: z.string().trim().max(80),
    site_url: z.string().trim().max(300),
    greeting: z.string().trim().min(1, "Write an opening line").max(400),
    instructions: z.string().max(12_000),
    language: z.enum(LANGUAGE_OPTIONS.map((language) => language.code) as [string, ...string[]]),
    voice_id: z.string().refine((value) => VOICE_OPTIONS.some((voice) => voice.id === value), "Pick a voice"),
    accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #6352F2"),
    avatar_style: z.enum(AVATAR_STYLES.map((style) => style.id) as [AvatarStyle, ...AvatarStyle[]]),
    launcher_label: z.string().trim().min(1).max(32),
    launcher_position: z.enum(["left", "center", "right"]),
    show_branding: z.boolean(),
    text_mode_enabled: z.boolean(),
    share_page_content: z.boolean(),
    feedback_interviews_enabled: z.boolean(),
    handoff_email: z.string().trim().email("Enter a valid email").max(320).or(z.literal("")).nullable(),
    handoff_webhook_url: z.string().trim().url("Enter a full URL").max(500).or(z.literal("")).nullable(),
    allowed_origins: z.array(z.string()).max(30),
    is_live: z.boolean(),
    builtin_tools: z.record(z.string(), z.boolean()),
    chat_model: z.enum(CHAT_MODELS.map((model) => model.id) as [ChatModelId, ...ChatModelId[]]),
    fallback_model: z.enum(CHAT_MODELS.map((model) => model.id) as [ChatModelId, ...ChatModelId[]]).nullable(),
  })
  .partial();

// A model can only be picked once its provider's API key is set on the server.
function unavailableModel(ids: (string | null | undefined)[]) {
  for (const id of ids) {
    if (!id || isChatModelAvailable(id)) continue;
    const model = chatModel(id)!;
    const key = model.provider === "anthropic" ? "ANTHROPIC_API_KEY" : model.provider === "openai" ? "OPENAI_API_KEY" : "GOOGLE_API_KEY";
    return `${model.name} needs a ${CHAT_PROVIDER_NAMES[model.provider]} API key. Set ${key} on the server first.`;
  }
  return null;
}

export async function actionUpdateAgent(agentId: string, patch: z.input<typeof updateSchema>): Promise<ActionResult> {
  try {
    const access = await authorizeAgent(agentId);
    if (!access.ok) return access;
    const data = updateSchema.parse(patch);

    if (data.allowed_origins) {
      const cleaned: string[] = [];
      for (const raw of data.allowed_origins) {
        const value = raw.trim().replace(/\/$/, "");
        if (!value) continue;
        const wildcard = value.match(/^(https?:\/\/)?\*\.([a-z0-9.-]+)$/i);
        if (wildcard) {
          cleaned.push(`${wildcard[1] ?? "https://"}*.${wildcard[2].toLowerCase()}`);
          continue;
        }
        const origin = normalizeOrigin(value);
        if (!origin) return { ok: false, error: `"${raw}" isn't a valid domain.` };
        cleaned.push(origin);
      }
      data.allowed_origins = [...new Set(cleaned)];
    }
    // Only a newly picked model has to be usable: a form that saves everything
    // shouldn't fail over a model that was already set (e.g. the default fallback
    // on an install without that provider's key).
    const modelProblem = unavailableModel([
      data.chat_model !== access.agent.chat_model ? data.chat_model : null,
      data.fallback_model !== access.agent.fallback_model ? data.fallback_model : null,
    ]);
    if (modelProblem) return { ok: false, error: modelProblem };
    // A fallback that's the same model wouldn't help.
    if ("chat_model" in data || "fallback_model" in data) {
      const primary = data.chat_model ?? access.agent.chat_model;
      const fallback = "fallback_model" in data ? data.fallback_model : access.agent.fallback_model;
      if (primary === fallback) return { ok: false, error: "Pick a different model for the fallback, or no fallback." };
    }
    if (data.show_branding === false && access.agent.show_branding && !(await canRemoveBranding(access.agent.organization_id))) {
      return { ok: false, error: `Removing "Powered by ${BRAND.name}" isn't part of your plan.` };
    }
    if (data.handoff_email === "") data.handoff_email = null;
    if (data.handoff_webhook_url === "") data.handoff_webhook_url = null;
    if (data.builtin_tools) data.builtin_tools = { ...access.agent.builtin_tools, ...data.builtin_tools };

    await supabaseAdmin
      .from("agents")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", agentId)
      .throwOnError();

    revalidatePath(`/account/${access.agent.organization_id}/agents`, "layout");
    return { ok: true };
  } catch (error) {
    console.error("actionUpdateAgent", error);
    return { ok: false, error: error instanceof z.ZodError ? error.issues[0].message : "Couldn't save changes." };
  }
}

export async function actionRotateIdentitySecret(agentId: string): Promise<ActionResult<{ secret: string }>> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  const secret = randomToken(32);
  const { error } = await supabaseAdmin.from("agents").update({ identity_secret: secret }).eq("id", agentId);
  if (error) return { ok: false, error: "Couldn't rotate the secret." };
  revalidatePath(`/account/${access.agent.organization_id}/agents/${agentId}/install`);
  return { ok: true, data: { secret } };
}

export async function actionDeleteAgent(agentId: string): Promise<ActionResult<{ organizationId: string }>> {
  try {
    const access = await authorizeAgent(agentId);
    if (!access.ok) return access;
    if (access.role === "member") return { ok: false, error: "Only workspace admins can delete assistants." };
    await supabaseAdmin.from("agents").delete().eq("id", agentId).throwOnError();
    revalidatePath(`/account/${access.agent.organization_id}/agents`);
    return { ok: true, data: { organizationId: access.agent.organization_id } };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

// The workspace's assistants, for the dashboard's help assistant to open a page
// inside one by name (src/components/dashboard/app-assistant.tsx).
export async function actionListAssistants(
  orgId: string,
): Promise<ActionResult<{ assistants: { id: string; assistantName: string; siteName: string | null }[] }>> {
  const access = await authorizeOrg(orgId);
  if (!access.ok) return access;
  const { data } = await supabaseAdmin
    .from("agents")
    .select("id, assistant_name, site_name")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });
  const assistants = (data ?? []).map((row) => ({
    id: row.id as string,
    assistantName: row.assistant_name as string,
    siteName: (row.site_name as string | null) ?? null,
  }));
  return { ok: true, data: { assistants } };
}
