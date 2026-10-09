// Sets up, or updates, the app's own help assistant: the bubble on every
// dashboard page that knows how the dashboard works.
//
//   npm run app-assistant
//
// It lives in an internal workspace (APP_ASSISTANT_WORKSPACE_ID, or a
// "<Brand> team" workspace owned by the first PLATFORM_ADMIN_EMAILS user),
// learns src/content/app-assistant/guide.md, and gets the dashboard's site map.
// Run it again after editing the guide. Then set NEXT_PUBLIC_APP_ASSISTANT_ID.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appUrl, BRAND } from "@/config/brand";
import { IS_CLOUD } from "@/config/edition";
import { DEFAULT_VOICE_ID } from "@/config/voices";
import { APP_SITE_MAP } from "@/content/app-assistant/site-map";
import { randomToken } from "@/lib/crypto";
import { indexKnowledgeSource } from "@/lib/knowledge/index-source";
import { embedSitePages } from "@/lib/site-map/search";
import { supabaseAdmin } from "@/lib/supabase/admin";

const GUIDE_TITLE = "Dashboard guide";

function guide() {
  let text = readFileSync(join(process.cwd(), "src/content/app-assistant/guide.md"), "utf8").replaceAll("{{product}}", BRAND.name);
  // Self-hosted installs have no plans or billing.
  if (!IS_CLOUD) text = text.replace(/\n## Billing and plans[\s\S]*$/, "\n");
  return text;
}

async function owner() {
  const email = (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",")[0]?.trim().toLowerCase();
  if (!email) throw new Error("Set PLATFORM_ADMIN_EMAILS (the first email owns the internal workspace).");
  const { data } = await supabaseAdmin.from("users").select("id, email").eq("email", email).maybeSingle();
  if (!data) throw new Error(`${email} hasn't signed up yet. Sign in once with it, then run this again.`);
  return data as { id: string; email: string };
}

async function workspace(admin: { id: string }) {
  const name = `${BRAND.name} team`;
  const explicit = process.env.APP_ASSISTANT_WORKSPACE_ID;
  let id = explicit ?? null;
  // The help assistant's current workspace, so renaming the product doesn't start a new one.
  if (!id && process.env.NEXT_PUBLIC_APP_ASSISTANT_ID) {
    const { data } = await supabaseAdmin.from("agents").select("organization_id").eq("id", process.env.NEXT_PUBLIC_APP_ASSISTANT_ID).maybeSingle();
    id = data?.organization_id ?? null;
  }
  if (!id) {
    const { data } = await supabaseAdmin.from("organizations").select("id").eq("name", name).eq("creator_id", admin.id).maybeSingle();
    id = data?.id ?? null;
  }
  if (!id) {
    const { data, error } = await supabaseAdmin.rpc("create_organization", { p_user_id: admin.id, p_name: name });
    if (error || !data) throw error ?? new Error("Couldn't create the workspace");
    id = data as string;
    console.log(`Created the "${name}" workspace.`);
  }
  // Our own assistant shouldn't run into plan limits.
  if (IS_CLOUD) {
    await supabaseAdmin.from("organizations").update({ plan_id: "premium", subscription_status: "active" }).eq("id", id);
  }
  return id;
}

async function main() {
  const admin = await owner();
  const organizationId = await workspace(admin);
  const name = `${BRAND.name} Guide`;
  const appOrigin = new URL(appUrl()).origin;

  const settings = {
    assistant_name: name,
    site_name: BRAND.name,
    site_url: appUrl("/account"),
    greeting: `Hi! I can show you around ${BRAND.name} or help you set up your assistant. What are you working on?`,
    instructions: [
      `You're the help assistant inside the ${BRAND.name} dashboard. The people you talk to are ${BRAND.name} customers setting up voice assistants for their own websites.`,
      "Help them find their way around and get the most out of the product. Prefer taking them to the right page and pointing at the right button over long explanations.",
      "\"Assistant\" in their questions usually means the assistant they're building, not you.",
      "If the guide doesn't cover something, say so and offer to pass it on to the team. Never invent features, limits or prices.",
      "Pages inside an assistant (Playground, Knowledge, Install and the rest) have {assistant} in their path. You don't need its ID: when the user is inside an assistant, or the workspace has only one, {assistant} is filled in for you. When there are several and you don't know which they mean, ask, then put the assistant's name (or its product's) in place of {assistant}, like /account/{workspace}/agents/Ava/install. If navigate says it couldn't tell which, ask them and try again. Don't send them to the assistants list to click through themselves.",
      "Always go by the current page: after you or the user moved, it shows where they are now. Inside an assistant, its sections are in the sidebar on the left; the assistant's name in the top bar isn't a link.",
    ].join("\n"),
    launcher_label: "Need help?",
    allowed_origins: [appOrigin],
    is_live: true,
    share_page_content: true,
    text_mode_enabled: true,
    voice_id: DEFAULT_VOICE_ID,
    avatar_style: "face",
    // It's our own product: no "Powered by" inside it.
    show_branding: false,
    handoff_email: admin.email,
  };

  let agentId = process.env.NEXT_PUBLIC_APP_ASSISTANT_ID ?? null;
  if (agentId) {
    const { data } = await supabaseAdmin.from("agents").select("id").eq("id", agentId).maybeSingle();
    agentId = data?.id ?? null;
  }
  if (!agentId) {
    const { data } = await supabaseAdmin.from("agents").select("id").eq("organization_id", organizationId).eq("assistant_name", name).maybeSingle();
    agentId = data?.id ?? null;
  }
  if (agentId) {
    await supabaseAdmin.from("agents").update(settings).eq("id", agentId).throwOnError();
  } else {
    const { data } = await supabaseAdmin
      .from("agents")
      .insert({
        ...settings,
        organization_id: organizationId,
        creator_id: admin.id,
        identity_secret: randomToken(32),
      })
      .select("id")
      .single()
      .throwOnError();
    agentId = data.id as string;
    console.log(`Created the "${name}" assistant.`);
  }

  // The guide, as one note (re-indexed only if it changed).
  const content = guide();
  const { data: note } = await supabaseAdmin
    .from("knowledge_sources")
    .select("id")
    .eq("agent_id", agentId)
    .eq("kind", "text")
    .eq("title", GUIDE_TITLE)
    .maybeSingle();
  let sourceId = note?.id as string | undefined;
  if (sourceId) {
    await supabaseAdmin.from("knowledge_sources").update({ content }).eq("id", sourceId).throwOnError();
  } else {
    const { data } = await supabaseAdmin
      .from("knowledge_sources")
      .insert({ agent_id: agentId, organization_id: organizationId, kind: "text", title: GUIDE_TITLE, content })
      .select("id")
      .single()
      .throwOnError();
    sourceId = data.id as string;
  }
  const indexed = await indexKnowledgeSource(sourceId!);
  if (!indexed.ok) throw new Error(`Couldn't index the guide: ${indexed.error}`);
  console.log(indexed.changed ? "Learned the updated guide." : "The guide hasn't changed.");

  // The dashboard's site map, replaced as a whole.
  await supabaseAdmin.from("site_pages").delete().eq("agent_id", agentId).throwOnError();
  await supabaseAdmin
    .from("site_pages")
    .insert(APP_SITE_MAP.map((page) => ({ ...page, agent_id: agentId, organization_id: organizationId, requires_auth: false })))
    .throwOnError();
  await embedSitePages(agentId!);

  console.log(`\nAdd this to your environment and restart the app:\nNEXT_PUBLIC_APP_ASSISTANT_ID=${agentId}`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
