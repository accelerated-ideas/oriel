import "server-only";
import { generateText } from "ai";
import type { ChatModel } from "@/config/ai";
import { languageModel, quickModelOptions } from "@/lib/ai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sha256 } from "@/lib/crypto";
import { recordUsage, type UsageScope } from "@/lib/usage/record";
import type { ActionParameter } from "@/lib/types";

const CONFIRMATION_WINDOW_MS = 15 * 60 * 1000;

// What an action acts on: its required arguments. Optional free text the
// model words differently each time (a reason, a note) is left out, so
// rephrasing it isn't a different action.
export function targetKeys(parameters: Pick<ActionParameter, "name" | "required">[]) {
  return parameters.filter((parameter) => parameter.required).map((parameter) => parameter.name);
}

function hashTarget(input: Record<string, unknown>, keys: string[]) {
  return sha256(JSON.stringify([...keys].sort().map((key) => [key, input[key] ?? null])));
}

export const CONFIRMATION_REQUIRED = {
  status: "confirmation_required",
  instruction:
    "Nothing has happened yet. Tell the user exactly what this will do, in one short sentence, and ask them to confirm with a yes-or-no question. When they agree, call this tool again with the same arguments and confirmed: true. If they hesitate or say no, don't call it again.",
};

// A sensitive action runs only after the user agreed to it:
//   - Usually the model calls the action without `confirmed` first: what it
//     proposed is recorded and it's told to ask. Once the user has replied,
//     a call with confirmed: true and the same target goes through. The model
//     judged the reply; the server checks the user had a turn in between.
//   - When the model offered it in its own words instead ("Want me to resend
//     it?") and calls with confirmed: true straight away, a quick check by a
//     model reads just the assistant's last message and the user's reply and
//     says whether the user agreed to exactly this.
// Either way only the user's own words can approve an action: nothing the
// model reads (a page, a tool result) can run one by itself.
export async function checkConfirmation(
  conversationId: string,
  action: { name: string; about: string },
  input: Record<string, unknown>,
  keys: string[],
  check: { model: ChatModel; usage: UsageScope },
) {
  const target = hashTarget(input, keys);

  if (input.confirmed === true) {
    const since = new Date(Date.now() - CONFIRMATION_WINDOW_MS).toISOString();
    const { data: proposal } = await supabaseAdmin
      .from("action_confirmations")
      .select("id, created_at")
      .eq("conversation_id", conversationId)
      .eq("action_name", action.name)
      .eq("input_hash", target)
      .is("consumed_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (proposal) {
      const { count: replies } = await supabaseAdmin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .eq("role", "user")
        .gt("created_at", proposal.created_at);
      if (replies) {
        await supabaseAdmin.from("action_confirmations").update({ consumed_at: new Date().toISOString() }).eq("id", proposal.id);
        return { confirmed: true as const };
      }
      // Proposed, but the user hasn't answered yet.
      return { confirmed: false as const };
    }
    if (await userAgreed(conversationId, action, input, check)) {
      await supabaseAdmin
        .from("action_confirmations")
        .insert({ conversation_id: conversationId, action_name: action.name, input_hash: target, consumed_at: new Date().toISOString() });
      return { confirmed: true as const };
    }
  }

  await supabaseAdmin.from("action_confirmations").insert({ conversation_id: conversationId, action_name: action.name, input_hash: target });
  return { confirmed: false as const };
}

// Whether the user's latest message agrees to this action, as an answer to
// the assistant's message before it.
async function userAgreed(
  conversationId: string,
  action: { name: string; about: string },
  input: Record<string, unknown>,
  { model, usage }: { model: ChatModel; usage: UsageScope },
) {
  const { data } = await supabaseAdmin
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .neq("content", "")
    .order("created_at", { ascending: false })
    .limit(8);
  // Newest first. The model may already have said something this turn
  // ("Sending it now."), so look for the user's latest message, then what the
  // assistant said before it.
  const rows = data ?? [];
  const replyAt = rows.findIndex((row) => row.role === "user");
  const reply = rows[replyAt];
  const asked = rows.slice(replyAt + 1).find((row) => row.role === "assistant");
  if (!reply || !asked) return false;

  const { confirmed: _confirmed, ...details } = input;
  try {
    const { text, usage: used } = await generateText({
      model: languageModel(model),
      providerOptions: quickModelOptions(model),
      maxOutputTokens: 400,
      prompt: `An assistant on a website wants to do this for the user: ${action.about} (${action.name}, ${JSON.stringify(details)}).

The assistant's last message to the user:
"""
${asked.content}
"""

The user's reply:
"""
${reply.content}
"""

Did the user clearly agree to exactly this action in their reply? A reply asking the assistant to go ahead counts. Hesitation, a question, a change of details or a no doesn't. Answer only yes or no.`,
    });
    await recordUsage(usage, {
      stage: "llm",
      purpose: "reply",
      modelId: model.id,
      inputTokens: used.inputTokens ?? 0,
      cachedInputTokens: used.inputTokenDetails?.cacheReadTokens ?? 0,
      outputTokens: used.outputTokens ?? 0,
    });
    return text.trim().toLowerCase().startsWith("yes");
  } catch (error) {
    console.error("Confirmation check failed", error);
    return false;
  }
}
