import "server-only";
import { isStepCount, streamText, type StopCondition, type ToolSet } from "ai";
import { chatModelsFor, languageModel, languageModelOptions } from "@/lib/ai";
import { FALLBACK_AFTER_MS, HISTORY_MESSAGE_LIMIT, type ChatModel } from "@/config/ai";
import { loadKnowledgeForPrompt, turnQuestion } from "@/lib/knowledge/search";
import { loadSiteMapForPrompt } from "@/lib/site-map/search";
import { loadRuntimeContext, type RuntimeContext } from "@/lib/runtime/context";
import {
  insertMessages,
  loadMessageRows,
  markLastVisitorMessageFree,
  rowsToModelMessages,
} from "@/lib/runtime/history";
import { buildRightNow, buildSystemPrompt } from "@/lib/runtime/system-prompt";
import {
  buildTools,
  CLOSING_TOOL_KINDS,
  confirmationCheck,
  notSignedIn,
  SILENT_TOOLS,
  toolDisplayName,
  type Channel,
  type ClientToolSpec,
} from "@/lib/runtime/tools";
import { checkConfirmation, CONFIRMATION_REQUIRED, targetKeys } from "@/lib/runtime/confirmations";
import { InlineMarkers } from "@/lib/runtime/inline-markers";
import { recordUsage } from "@/lib/usage/record";
import type { MessageRow } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

export type ClientToolCall = {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  spec: ClientToolSpec;
};

export type TurnEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-activity"; toolCallId: string; name: string; label: string }
  | { type: "client-tool-calls"; calls: ClientToolCall[] }
  // Something to do in the browser without waiting for a result: on calls,
  // pointing at an element (a [[name]] marker in the reply).
  | {
      type: "client-effect";
      toolCallId: string;
      name: "highlight";
      input: { label: string };
    }
  | { type: "finish" }
  | { type: "error"; message: string };

// The shape the widget receives for browser-side tool calls.
export function serializeClientCalls(calls: ClientToolCall[]) {
  return calls.map((call) => ({
    toolCallId: call.toolCallId,
    kind: call.spec.kind,
    name: call.spec.kind === "client_action" ? call.spec.action.name : call.toolName,
    input: call.input,
  }));
}

const MAX_ROUNDS = 3;
const TOO_SLOW = "Sorry, that took too long. Could you say that again?";
const TURN_TIMEOUT_MS = 45_000;
// Stream parts that show the model has started answering.
const ANSWER_PARTS = new Set(["text-start", "text-delta", "reasoning-start", "reasoning-delta", "tool-input-start", "tool-call", "finish-step"]);

// Anthropic caches the prompt up to this mark (the tools and the stable part
// of the system prompt); other providers cache matching prefixes on their own.
// The page, this turn's matches and the time come after it, in a second block:
// with them in the user's turn instead, Haiku without thinking started saying
// its reasoning aloud ("The user confirmed, so I'll…") in 5 of 59 call turns.
const CACHE = { anthropic: { cacheControl: { type: "ephemeral" as const } } };

// Tools that work in the background. When a step already answered the user
// and only these ran, the turn is over: another step would just say it again.
const QUIET_TOOLS = new Set(["capture_feedback"]);
const answeredWithQuietTools: StopCondition<ToolSet> = ({ steps }) => {
  const last = steps.at(-1);
  return (
    !!last?.text.trim() &&
    last.toolCalls.length > 0 &&
    last.toolCalls.every((call) => QUIET_TOOLS.has(call.toolName))
  );
};

type PendingCall = {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  providerMetadata: Record<string, unknown> | null;
  target: "server" | "client";
};

// Client calls are checked here before they reach the browser: unsafe URLs,
// missing sign-in or a missing confirmation turn into a tool result instead.
async function preflightClientCall(context: RuntimeContext, call: PendingCall, spec: ClientToolSpec) {
  if (spec.kind === "navigate") {
    const url = String(call.input.url ?? "").trim();
    const isPath = url.startsWith("/") && !url.startsWith("//");
    let isWeb = false;
    try {
      isWeb = ["http:", "https:"].includes(new URL(url).protocol);
    } catch {
      isWeb = false;
    }
    if (!isPath && !isWeb)
      return {
        error: "That isn't a valid page. Use a path from the site map.",
      };
    // The playground isn't the site: say where it would go instead.
    if (context.conversation.is_preview) {
      return {
        preview: true,
        result: `Not opened: this is the playground. Tell them that on their site you'd take visitors to ${url}, and carry on.`,
      };
    }
    return null;
  }

  if (spec.kind === "client_action") {
    const { action } = spec;
    if (action.requires_identity && !context.conversation.user_verified) return notSignedIn(context);
    if (action.requires_confirmation) {
      const { confirmed } = await checkConfirmation(
        context.conversation.id,
        { name: action.name, about: action.title || action.description || action.name },
        call.input,
        targetKeys(action.parameters),
        confirmationCheck(context),
      );
      if (!confirmed) return CONFIRMATION_REQUIRED;
    }
  }
  return null;
}

function rowsForStep(
  conversationId: string,
  channel: Channel,
  pageUrl: string | null,
  text: string,
  calls: PendingCall[],
  results: { toolCallId: string; toolName: string; output: unknown }[],
): Partial<MessageRow>[] {
  const rows: Partial<MessageRow>[] = [];
  if (text.trim()) {
    rows.push({
      conversation_id: conversationId,
      role: "assistant",
      content: text.trim(),
      channel,
      page_url: pageUrl,
    });
  }
  for (const call of calls) {
    rows.push({
      conversation_id: conversationId,
      role: "assistant",
      content: "",
      channel,
      tool_call_id: call.toolCallId,
      tool_name: call.toolName,
      tool_input: call.input,
      tool_target: call.target,
      provider_metadata: call.providerMetadata,
      page_url: pageUrl,
    });
  }
  for (const result of results) {
    rows.push({
      conversation_id: conversationId,
      role: "tool",
      content: "",
      channel,
      tool_call_id: result.toolCallId,
      tool_name: result.toolName,
      tool_output: result.output,
      page_url: pageUrl,
    });
  }
  return rows;
}

export async function* runAgentTurn({
  conversationId,
  channel,
  abortSignal,
  speakOnly = false,
  turnId = crypto.randomUUID(),
}: {
  conversationId: string;
  channel: Channel;
  abortSignal?: AbortSignal;
  // Generate speech only (no tools), e.g. the first line after a page change.
  speakOnly?: boolean;
  // Ties this reply's costs together (a voice turn shares it with its speech).
  turnId?: string;
}): AsyncGenerator<TurnEvent> {
  const context = await loadRuntimeContext(conversationId);
  if (!context) {
    yield { type: "error", message: "Conversation not found" };
    return;
  }

  // The assistant's model, then its fallback. Once the fallback takes over it
  // answers the rest of the turn.
  const models = chatModelsFor(context.agent);
  let modelIndex = 0;

  // Tokens across every model step of this turn, per model, recorded at the end.
  const tokens = new Map<string, { input: number; cached: number; written: number; output: number; largestPrompt: number }>();
  try {
    yield* turnRounds();
  } finally {
    for (const [modelId, used] of tokens) {
      if (used.input + used.output === 0) continue;
      await recordUsage(
        {
          organizationId: context.conversation.organization_id,
          agentId: context.agent.id,
          conversationId,
          turnId,
        },
        {
          stage: "llm",
          purpose: "reply",
          modelId,
          inputTokens: used.input,
          cachedInputTokens: used.cached,
          cacheWriteInputTokens: used.written,
          outputTokens: used.output,
          largestPromptTokens: used.largestPrompt,
        },
      );
    }
  }

  async function* turnRounds(): AsyncGenerator<TurnEvent> {
    if (!context) return;

    const useMarkers = context.agent.builtin_tools?.highlight !== false && !context.conversation.is_preview;
    let markerCount = 0;
    // Text from a later step of the same reply (after a tool) is set apart,
    // so two steps don't run together ("…now.This will…"). In chat a tool's
    // activity line already splits them; a call's speech is one stream.
    let lastShown: "text" | "activity" | null = null;
    let stepHasText = false;
    let spoken = false;
    const show = (text: string): TurnEvent => {
      const gap = stepHasText ? "" : channel === "voice" ? (spoken ? " " : "") : lastShown === "text" ? "\n\n" : "";
      spoken = true;
      stepHasText = true;
      lastShown = "text";
      return { type: "text-delta", text: gap + text };
    };
    const signal = abortSignal
      ? AbortSignal.any([abortSignal, AbortSignal.timeout(TURN_TIMEOUT_MS)])
      : AbortSignal.timeout(TURN_TIMEOUT_MS);
    // The visitor leaving or talking over it ends a turn quietly; running out
    // of time with nothing said tells them, instead of leaving them waiting.
    const timedOut = () => signal.aborted && !abortSignal?.aborted && lastShown === null;
    const pageUrl = context.conversation.page_url;
    let found: Pick<Parameters<typeof buildSystemPrompt>[0], "knowledge" | "siteMap"> | null = null;
    let built: ReturnType<typeof buildTools> | null = null;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const rows = await loadMessageRows(conversationId);
      const messages = rowsToModelMessages(rows);
      if (messages.length === 0) {
        yield { type: "finish" };
        return;
      }

      // Searched once per turn: tool rounds answer the same question.
      if (!found) {
        const question = turnQuestion(rows, {
          organizationId: context.agent.organization_id,
          agentId: context.agent.id,
          conversationId,
          turnId,
        });
        const [knowledge, siteMap] = await Promise.all([
          loadKnowledgeForPrompt(context.agent.id, question),
          loadSiteMapForPrompt(context.agent.id, context.siteMap, question, pageUrl),
        ]);
        found = { knowledge, siteMap };
      }
      built ??= buildTools(context, channel, { searchKnowledge: found.knowledge.mode === "retrieval" });
      // The latest thing in the conversation is the assistant taking them somewhere.
      const justMoved = rows.at(-1)?.tool_name === "navigate";
      const { tools, clientTools } = built;
      const instructions = buildSystemPrompt({ context, channel, ...found });
      const rightNow = buildRightNow({
        context,
        channel,
        ...found,
        justMoved,
        trimmed: rows.length >= HISTORY_MESSAGE_LIMIT,
        latestMessage: rows.findLast((row) => row.role === "user" && row.content.trim())?.content,
      });
      // Per model (the fallback may answer instead): caches are per model anyway.
      const systemFor = (model: ChatModel) => [
        {
          role: "system" as const,
          content: model.pageReading && tools.read_page ? `${instructions}\n\n## Reading the page\n${model.pageReading}` : instructions,
          providerOptions: CACHE,
        },
        { role: "system" as const, content: rightNow },
      ];

      let stepText = "";
      let stepCalls: PendingCall[] = [];
      let stepResults: {
        toolCallId: string;
        toolName: string;
        output: unknown;
      }[] = [];
      const pendingClient: PendingCall[] = [];

      const flushStep = async () => {
        const toPersist = rowsForStep(conversationId, channel, pageUrl, stepText, stepCalls, stepResults);
        stepText = "";
        stepCalls = [];
        stepResults = [];
        await insertMessages(toPersist);
      };

      // If the model fails, or hasn't started answering in time, before anything
      // reached the visitor, the fallback model answers the round instead.
      // After that, a failure ends the turn with what was already said.
      for (;;) {
        const model = models[modelIndex];
        const next = models[modelIndex + 1];
        const markers = useMarkers ? new InlineMarkers() : null;
        // Model text on its way out, with pointing markers turned into effects.
        const emit = function* (text: string): Generator<TurnEvent> {
          if (!text) return;
          shown = true;
          if (!markers) {
            stepText += text;
            yield show(text);
            return;
          }
          for (const piece of markers.push(text)) {
            if ("point" in piece) {
              yield { type: "client-effect", toolCallId: `point-${++markerCount}`, name: "highlight", input: { label: piece.point } };
            } else {
              stepText += piece.text;
              yield show(piece.text);
            }
          }
        };
        const attempt = new AbortController();
        let answering = false;
        // Something reached the visitor or the transcript.
        let shown = false;
        const stall = next
          ? setTimeout(() => {
              if (!answering) attempt.abort(new Error(`${model.id} didn't start answering in ${FALLBACK_AFTER_MS / 1000}s`));
            }, FALLBACK_AFTER_MS)
          : null;

        try {
          const result = streamText({
            model: languageModel(model),
            system: systemFor(model),
            messages,
            tools,
            toolChoice: speakOnly ? "none" : "auto",
            stopWhen: [isStepCount(6), answeredWithQuietTools],
            // Right after taking them somewhere, look at the page before
            // speaking: replies about it are then grounded in what's there,
            // instead of "Let me read it" and nothing, or guesses.
            prepareStep: ({ stepNumber }) =>
              stepNumber === 0 && justMoved && tools.read_page && !speakOnly
                ? { toolChoice: { type: "tool" as const, toolName: "read_page" } }
                : {},
            // With a fallback ready, switching is faster than retrying.
            maxRetries: next ? 0 : 1,
            abortSignal: AbortSignal.any([signal, attempt.signal]),
            providerOptions: languageModelOptions(model, channel),
          });

          for await (const part of result.stream) {
            if (!answering && ANSWER_PARTS.has(part.type)) {
              answering = true;
              if (stall) clearTimeout(stall);
            }
            switch (part.type) {
              case "text-delta": {
                if (part.text) yield* emit(part.text);
                break;
              }
              case "tool-call": {
                shown = true;
                const isClient = clientTools.has(part.toolName);
                const call: PendingCall = {
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  input: (part.input ?? {}) as Record<string, unknown>,
                  providerMetadata: (part.providerMetadata as Record<string, unknown> | undefined) ?? null,
                  target: isClient ? "client" : "server",
                };
                stepCalls.push(call);
                // Closing the conversation: the goodbye goes in the tool's input, so
                // it's said even when the model calls the tool before writing anything.
                const spec = clientTools.get(part.toolName);
                const goodbye = typeof call.input.goodbye === "string" ? call.input.goodbye.trim() : "";
                if (spec && CLOSING_TOOL_KINDS.has(spec.kind) && goodbye && !stepText.trim()) {
                  stepText += goodbye;
                  yield show(goodbye);
                }
                if (isClient) {
                  pendingClient.push(call);
                } else if (!SILENT_TOOLS.has(part.toolName)) {
                  lastShown = "activity";
                  yield {
                    type: "tool-activity",
                    toolCallId: part.toolCallId,
                    name: part.toolName,
                    label: toolDisplayName(part.toolName, context.actions),
                  };
                }
                break;
              }
              case "tool-result": {
                stepResults.push({
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  output: part.output,
                });
                break;
              }
              case "tool-error": {
                stepResults.push({
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  output: { error: errorMessage(part.error) },
                });
                break;
              }
              case "finish-step": {
                shown = true;
                const used = tokens.get(model.id) ?? { input: 0, cached: 0, written: 0, output: 0, largestPrompt: 0 };
                const input = part.usage.inputTokens ?? 0;
                used.input += input;
                used.cached += part.usage.inputTokenDetails?.cacheReadTokens ?? 0;
                used.written += part.usage.inputTokenDetails?.cacheWriteTokens ?? 0;
                used.output += part.usage.outputTokens ?? 0;
                used.largestPrompt = Math.max(used.largestPrompt, input);
                tokens.set(model.id, used);
                for (const piece of markers?.end() ?? []) {
                  if ("text" in piece) {
                    stepText += piece.text;
                    yield show(piece.text);
                  }
                }
                stepHasText = false;
                await flushStep();
                break;
              }
              case "error": {
                throw part.error;
              }
              case "abort": {
                // A cancelled stream ends quietly. When it's this attempt that gave
                // up (the model stalled), treat it as a failure so the fallback runs.
                if (attempt.signal.aborted && !signal.aborted) throw attempt.signal.reason;
                break;
              }
            }
          }
          // Anything left over (e.g. the stream ended without a finish-step).
          await flushStep();
        } catch (error) {
          // Keep whatever was already said so the transcript matches what the user heard.
          if (stepText.trim()) {
            stepCalls = [];
            stepResults = [];
            await flushStep();
          }
          if (signal.aborted) {
            if (timedOut()) yield { type: "error", message: TOO_SLOW };
            return;
          }
          if (next && !shown) {
            console.error(`Reply model ${model.id} failed, switching to ${next.id}`, error);
            modelIndex += 1;
            stepHasText = false;
            stepText = "";
            stepCalls = [];
            stepResults = [];
            pendingClient.length = 0;
            continue;
          }
          console.error("Agent turn failed", error);
          yield { type: "error", message: errorMessage(error) };
          return;
        } finally {
          if (stall) clearTimeout(stall);
        }
        break;
      }

      if (signal.aborted) {
        if (timedOut()) yield { type: "error", message: TOO_SLOW };
        return;
      }
      if (pendingClient.length === 0) {
        yield { type: "finish" };
        return;
      }

      const forwardable: ClientToolCall[] = [];
      const blockedResults: {
        toolCallId: string;
        toolName: string;
        output: unknown;
      }[] = [];
      for (const call of pendingClient) {
        const spec = clientTools.get(call.toolName)!;
        const blocked = await preflightClientCall(context, call, spec);
        if (blocked) {
          blockedResults.push({
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            output: blocked,
          });
        } else {
          forwardable.push({
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            input: call.input,
            spec,
          });
        }
      }
      if (blockedResults.length > 0) {
        await insertMessages(rowsForStep(conversationId, channel, pageUrl, "", [], blockedResults));
      }

      if (forwardable.length > 0) {
        // The assistant closed the conversation in reply to a goodbye: that message isn't billed.
        if (forwardable.some((call) => CLOSING_TOOL_KINDS.has(call.spec.kind))) {
          await markLastVisitorMessageFree(conversationId);
        }
        yield { type: "client-tool-calls", calls: forwardable };
        yield { type: "finish" };
        return;
      }
      // Every client call was blocked: run another round so the model can respond to it.
    }

    yield { type: "finish" };
  }
}

// Stores results the browser sends back for client tool calls.
export async function recordClientToolResults(
  conversationId: string,
  channel: Channel,
  results: { toolCallId: string; output: unknown }[],
) {
  if (results.length === 0) return 0;
  const rows = await loadMessageRows(conversationId, 200);
  const calls = new Map(
    rows
      .filter((row) => row.role === "assistant" && row.tool_call_id && row.tool_target === "client")
      .map((row) => [row.tool_call_id!, row]),
  );
  const answered = new Set(rows.filter((row) => row.role === "tool").map((row) => row.tool_call_id));

  // Unanswered client calls, newest first: a fallback when an ID doesn't match.
  const unanswered = [...calls.values()].filter((row) => !answered.has(row.tool_call_id)).reverse();

  const toInsert: Partial<MessageRow>[] = [];
  for (const result of results) {
    let call = calls.get(result.toolCallId);
    if (call && answered.has(result.toolCallId)) continue;
    if (!call) call = unanswered.shift();
    else unanswered.splice(unanswered.indexOf(call), 1);
    if (!call) continue;
    answered.add(call.tool_call_id);
    toInsert.push({
      conversation_id: conversationId,
      role: "tool",
      content: "",
      channel,
      tool_call_id: call.tool_call_id,
      tool_name: call.tool_name,
      tool_output: typeof result.output === "string" ? result.output.slice(0, 2000) : result.output,
    });
  }
  await insertMessages(toInsert);
  return toInsert.length;
}
