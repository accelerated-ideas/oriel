"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { authorizeAgent } from "@/lib/auth/access";
import { encryptSecret } from "@/lib/crypto";
import { stripeClient } from "@/lib/actions/stripe";
import { loadStripeConnection, saveStripeConnection, stripeAccountName, stripeApiKey } from "@/lib/integrations/stripe";
import { updateConfig } from "@/lib/integrations/store";
import { BUILTIN_TOOL_NAMES } from "@/lib/runtime/tools";
import { errorMessage } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

function actionsPath(organizationId: string, agentId: string) {
  return `/account/${organizationId}/agents/${agentId}/actions`;
}

const parameterSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,40}$/, "Parameter names use lowercase letters, numbers and underscores"),
  type: z.enum(["string", "number", "boolean"]),
  description: z.string().trim().max(400).default(""),
  required: z.boolean().default(false),
  enum: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
});

const headerSchema = z.object({
  key: z.string().trim().max(100),
  // Empty value with `keep` means "leave the stored value unchanged".
  value: z.string().max(4000).default(""),
  keep: z.boolean().default(false),
});

const actionSchema = z.object({
  id: z.string().uuid().nullish(),
  kind: z.enum(["http", "client"]),
  name: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,47}$/, "Names use lowercase letters, numbers and underscores, e.g. create_campaign"),
  title: z.string().trim().min(1, "Add a title").max(80),
  description: z.string().trim().min(10, "Describe when the assistant should use it").max(1500),
  requires_confirmation: z.boolean(),
  requires_identity: z.boolean(),
  parameters: z.array(parameterSchema).max(20),
  http: z
    .object({
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
      url: z.string().trim().url("Enter the full URL, including https://").max(1000),
      headers: z.array(headerSchema).max(15),
      body: z.string().max(10_000).default(""),
    })
    .nullish(),
});

type StoredHeader = { key: string; value_encrypted: string; preview: string };

export async function actionSaveAction(agentId: string, input: z.input<typeof actionSchema>): Promise<ActionResult> {
  try {
    const access = await authorizeAgent(agentId);
    if (!access.ok) return access;
    const data = actionSchema.parse(input);

    if (BUILTIN_TOOL_NAMES.has(data.name) || data.name.startsWith("stripe_")) {
      return { ok: false, error: `"${data.name}" is reserved. Pick another name.` };
    }
    const names = data.parameters.map((parameter) => parameter.name);
    if (new Set(names).size !== names.length) return { ok: false, error: "Parameter names must be unique." };
    if (names.includes("confirmed")) return { ok: false, error: '"confirmed" is reserved for confirmations.' };

    let existingHeaders: StoredHeader[] = [];
    if (data.id) {
      const { data: existing } = await supabaseAdmin
        .from("actions")
        .select("config")
        .eq("id", data.id)
        .eq("agent_id", agentId)
        .maybeSingle();
      existingHeaders = ((existing?.config as { headers?: StoredHeader[] })?.headers ?? []) as StoredHeader[];
    }

    let config: Record<string, unknown> = {};
    if (data.kind === "http") {
      if (!data.http) return { ok: false, error: "Add the request details." };
      const headers: StoredHeader[] = [];
      for (const header of data.http.headers) {
        if (!header.key) continue;
        if (header.keep) {
          const previous = existingHeaders.find((stored) => stored.key === header.key);
          if (previous) headers.push(previous);
          continue;
        }
        headers.push({
          key: header.key,
          value_encrypted: encryptSecret(header.value),
          preview: header.value.length > 8 ? `${header.value.slice(0, 3)}…${header.value.slice(-3)}` : "•••",
        });
      }
      config = { method: data.http.method, url: data.http.url, headers, body: data.http.body };
    }

    const row = {
      kind: data.kind,
      name: data.name,
      title: data.title,
      description: data.description,
      requires_confirmation: data.requires_confirmation,
      requires_identity: data.requires_identity,
      parameters: data.parameters,
      config,
      updated_at: new Date().toISOString(),
    };

    const { error } = data.id
      ? await supabaseAdmin.from("actions").update(row).eq("id", data.id).eq("agent_id", agentId)
      : await supabaseAdmin
          .from("actions")
          .insert({ ...row, agent_id: agentId, organization_id: access.agent.organization_id });
    if (error) {
      if (error.code === "23505") return { ok: false, error: `An action called "${data.name}" already exists.` };
      throw error;
    }

    revalidatePath(actionsPath(access.agent.organization_id, agentId));
    return { ok: true };
  } catch (error) {
    console.error("actionSaveAction", error);
    return { ok: false, error: error instanceof z.ZodError ? error.issues[0].message : "Couldn't save the action." };
  }
}

export async function actionUpdateActionFlags(
  agentId: string,
  actionId: string,
  flags: { enabled?: boolean; requires_confirmation?: boolean; allowed_prices?: { price_id: string; label: string }[] },
): Promise<ActionResult> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (flags.enabled !== undefined) patch.enabled = flags.enabled;
  if (flags.requires_confirmation !== undefined) patch.requires_confirmation = flags.requires_confirmation;
  if (flags.allowed_prices) {
    const prices = flags.allowed_prices
      .map((price) => ({ price_id: price.price_id.trim(), label: price.label.trim() }))
      .filter((price) => price.price_id && price.label);
    if (prices.some((price) => !price.price_id.startsWith("price_"))) {
      return { ok: false, error: "Stripe price IDs start with price_" };
    }
    const { data: current } = await supabaseAdmin.from("actions").select("config").eq("id", actionId).single();
    patch.config = { ...(current?.config ?? {}), allowed_prices: prices };
  }

  const { error } = await supabaseAdmin.from("actions").update(patch).eq("id", actionId).eq("agent_id", agentId);
  if (error) return { ok: false, error: "Couldn't update the action." };
  revalidatePath(actionsPath(access.agent.organization_id, agentId));
  return { ok: true };
}

export async function actionDeleteAction(agentId: string, actionId: string): Promise<ActionResult> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  await supabaseAdmin.from("actions").delete().eq("id", actionId).eq("agent_id", agentId).neq("kind", "stripe");
  revalidatePath(actionsPath(access.agent.organization_id, agentId));
  return { ok: true };
}

export async function actionConnectStripe(agentId: string, secretKey: string): Promise<ActionResult> {
  try {
    const access = await authorizeAgent(agentId);
    if (!access.ok) return access;
    const key = secretKey.trim();
    if (!/^(sk|rk)_(live|test)_[A-Za-z0-9]+$/.test(key)) {
      return { ok: false, error: "Paste a Stripe secret or restricted key (starts with rk_ or sk_)." };
    }

    // Verify the key can read customers before storing it.
    const stripe = stripeClient(key);
    try {
      await stripe.customers.list({ limit: 1 });
    } catch (error) {
      return { ok: false, error: `Stripe rejected the key: ${errorMessage(error)}` };
    }

    await saveStripeConnection({
      agentId,
      organizationId: access.agent.organization_id,
      secret: { via: "key", key },
      metadata: {
        account_name: await stripeAccountName(stripe),
        livemode: key.includes("_live_"),
        key_hint: key.slice(-4),
        connected_via: "key",
      },
    });

    revalidatePath(actionsPath(access.agent.organization_id, agentId));
    return { ok: true };
  } catch (error) {
    console.error("actionConnectStripe", error);
    return { ok: false, error: "Couldn't connect Stripe." };
  }
}

export async function actionDisconnectStripe(agentId: string): Promise<ActionResult> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  // The app stays installed in their Stripe account until they uninstall it
  // there; without the tokens, we can't use it.
  await supabaseAdmin.from("integrations").delete().eq("agent_id", agentId).eq("provider", "stripe");
  await supabaseAdmin.from("actions").delete().eq("agent_id", agentId).eq("kind", "stripe");
  revalidatePath(actionsPath(access.agent.organization_id, agentId));
  return { ok: true };
}

export async function actionListStripePrices(agentId: string): Promise<ActionResult<{ prices: { id: string; label: string }[] }>> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  const connection = await loadStripeConnection(agentId);
  if (!connection) return { ok: false, error: "Connect Stripe first." };
  try {
    const stripe = stripeClient(await stripeApiKey(connection));
    const prices = await stripe.prices.list({ active: true, type: "recurring", limit: 50, expand: ["data.product"] });
    return {
      ok: true,
      data: {
        prices: prices.data.map((price) => {
          const product = typeof price.product === "object" && price.product && "name" in price.product ? price.product.name : "";
          const amount = price.unit_amount != null ? `${(price.unit_amount / 100).toFixed(2)} ${price.currency.toUpperCase()}` : "";
          return { id: price.id, label: [product, price.nickname, amount && `${amount}/${price.recurring?.interval}`].filter(Boolean).join(" · ") };
        }),
      },
    };
  } catch (error) {
    return { ok: false, error: `Couldn't load prices: ${errorMessage(error)}` };
  }
}


const stripeSaveSchema = z.object({
  match_by_email: z.boolean().optional(),
  actions: z.array(z.object({ id: z.string().uuid(), enabled: z.boolean(), requires_confirmation: z.boolean() })).max(20),
});

// Saves the Stripe drawer at once. match_by_email: find a signed-in user's
// Stripe customer by email when the site sends no customer ID (only safe when
// the site verifies emails).
export async function actionSaveStripe(agentId: string, changes: z.input<typeof stripeSaveSchema>): Promise<ActionResult> {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return access;
  const parsed = stripeSaveSchema.safeParse(changes);
  if (!parsed.success) return { ok: false, error: "Couldn't save those changes." };
  const connection = await loadStripeConnection(agentId);
  if (!connection) return { ok: false, error: "Connect Stripe first." };

  if (parsed.data.match_by_email !== undefined) {
    await updateConfig(connection, { ...connection.config, match_by_email: parsed.data.match_by_email });
  }
  if (parsed.data.actions.length > 0) {
    const { data: current } = await supabaseAdmin
      .from("actions")
      .select("id, config")
      .eq("agent_id", agentId)
      .eq("kind", "stripe")
      .in("id", parsed.data.actions.map((action) => action.id));
    for (const action of parsed.data.actions) {
      const config = current?.find((row) => row.id === action.id)?.config as { operation?: string; allowed_prices?: unknown[] } | undefined;
      if (!config) continue;
      if (action.enabled && config.operation === "change_plan" && !config.allowed_prices?.length) {
        return { ok: false, error: "Choose the plans it may switch people to before turning on Change plan." };
      }
      await supabaseAdmin
        .from("actions")
        .update({ enabled: action.enabled, requires_confirmation: action.requires_confirmation, updated_at: new Date().toISOString() })
        .eq("id", action.id)
        .eq("agent_id", agentId)
        .throwOnError();
    }
  }
  revalidatePath(actionsPath(access.agent.organization_id, agentId));
  return { ok: true };
}
