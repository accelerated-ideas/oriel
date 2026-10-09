import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Compass,
  Keyboard,
  LifeBuoy,
  MessageSquareText,
  Mic,
  MousePointerClick,
  PhoneOff,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { toolDisplayName } from "@/lib/runtime/tools";
import {
  countryFlag,
  countryName,
  describeDevice,
  formatCallTime,
  hostOf,
  pathOf,
  visitorName,
  visitorSeed,
} from "@/lib/conversations/visitor";
import { textOn } from "@/lib/color";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { Badge } from "@/components/ui/misc";
import { MonsterAvatar } from "@/components/ui/monster-avatar";
import type { Action, Agent, Conversation, Insight, MessageRow } from "@/lib/types";
import { cn, truncate } from "@/lib/utils";

// ---------- transcript model ----------

type Bubble = { id: string; content: string; at: string; channel: "voice" | "text" | null; interrupted: boolean };

type TranscriptItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "page"; key: string; path: string; first: boolean }
  | { kind: "event"; key: string; text: string }
  | { kind: "tool"; key: string; name: string; label: string; input: unknown; output: unknown; done: boolean }
  | { kind: "group"; key: string; role: "user" | "assistant"; bubbles: Bubble[] };

// Messages further apart than this start a new group, with its own time.
const GROUP_GAP_MS = 5 * 60_000;

function buildTranscript(messages: MessageRow[], actions: Action[]): TranscriptItem[] {
  const results = new Map(messages.filter((m) => m.role === "tool" && m.tool_call_id).map((m) => [m.tool_call_id!, m]));
  const items: TranscriptItem[] = [];
  let lastDay = "";
  // Where the visitor was when the conversation started.
  const firstPage = pathOf(messages.find((m) => m.role === "user" && m.page_url)?.page_url ?? null);
  let lastPage: string | null = null;
  let group: Extract<TranscriptItem, { kind: "group" }> | null = null;

  for (const message of messages) {
    if (message.role === "tool") continue;
    const day = format(new Date(message.created_at), "yyyy-MM-dd");
    if (day !== lastDay) {
      items.push({ kind: "day", key: `day-${day}`, label: format(new Date(message.created_at), "EEEE, MMMM d") });
      lastDay = day;
      group = null;
      if (firstPage && lastPage === null) {
        items.push({ kind: "page", key: "page-start", path: firstPage, first: true });
        lastPage = firstPage;
      }
    }

    if (message.role === "user" && message.page_url) {
      const path = pathOf(message.page_url);
      if (path && path !== lastPage) {
        items.push({ kind: "page", key: `page-${message.id}`, path, first: lastPage === null });
        lastPage = path;
        group = null;
      }
    }

    if (message.role === "event") {
      items.push({ kind: "event", key: message.id, text: message.content });
      group = null;
      continue;
    }
    if (message.role === "assistant" && message.tool_call_id) {
      const result = results.get(message.tool_call_id);
      items.push({
        kind: "tool",
        key: message.id,
        name: message.tool_name ?? "",
        label: toolDisplayName(message.tool_name ?? "", actions),
        input: message.tool_input ?? {},
        output: result?.tool_output,
        done: Boolean(result),
      });
      group = null;
      continue;
    }

    const content = message.content.trim();
    if (!content) continue;
    const role = message.role as "user" | "assistant";
    const bubble: Bubble = {
      id: message.id,
      content,
      at: message.created_at,
      channel: message.channel === "voice" || message.channel === "text" ? message.channel : null,
      interrupted: role === "assistant" && content.endsWith("—"),
    };
    const previous = group?.bubbles[group.bubbles.length - 1];
    if (
      group &&
      group.role === role &&
      previous &&
      new Date(message.created_at).getTime() - new Date(previous.at).getTime() < GROUP_GAP_MS
    ) {
      group.bubbles.push(bubble);
    } else {
      group = { kind: "group", key: message.id, role, bubbles: [bubble] };
      items.push(group);
    }
  }
  return items;
}

// ---------- pieces ----------

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  navigate: Compass,
  highlight: MousePointerClick,
  search_knowledge: BookOpen,
  capture_feedback: MessageSquareText,
  escalate_to_human: LifeBuoy,
  end_call: PhoneOff,
};

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <div>
      <p className="text-[11.5px] font-medium text-muted">{label}</p>
      <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-surface p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-ink-2 shadow-border scrollbar-thin">
        {text}
      </pre>
    </div>
  );
}

function ToolRow({ item }: { item: Extract<TranscriptItem, { kind: "tool" }> }) {
  const Icon = TOOL_ICONS[item.name] ?? Zap;
  return (
    <details className="group/tool">
      <summary className="mx-auto flex w-fit cursor-pointer list-none items-center gap-2 rounded-full bg-surface py-1.5 pr-2.5 pl-3 text-[12.5px] text-ink-2 shadow-border transition-[background-color,box-shadow] duration-150 hover:bg-zinc-50 hover:shadow-border-hover [&::-webkit-details-marker]:hidden">
        <Icon className="size-3.5 text-accent" />
        <span className="font-medium">{item.label}</span>
        <ChevronDown className="size-3.5 text-faint transition-transform duration-200 group-open/tool:rotate-180" />
      </summary>
      <div className="mx-auto mt-2 flex max-w-[560px] flex-col gap-3 rounded-2xl bg-zinc-50 p-3.5 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.05)]">
        <p className="font-mono text-[11.5px] text-muted">{item.name}</p>
        <JsonBlock label="Input" value={item.input} />
        {item.done && <JsonBlock label="Result" value={item.output} />}
      </div>
    </details>
  );
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-[12px] text-muted">
      <span className="h-px flex-1 bg-line" />
      <span className="flex items-center gap-1.5">{children}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

// Corners tighten on the avatar's side where bubbles in a group meet, like the widget.
function bubbleShape(role: "user" | "assistant", first: boolean) {
  return role === "user"
    ? cn("rounded-[20px] rounded-br-md", !first && "rounded-tr-md")
    : cn("rounded-[20px] rounded-bl-md", !first && "rounded-tl-md");
}

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="[&:not(:first-child)]:mt-2">{children}</p>,
        ul: ({ children }) => <ul className="mt-2 list-disc pl-5 first:mt-0">{children}</ul>,
        ol: ({ children }) => <ol className="mt-2 list-decimal pl-5 first:mt-0">{children}</ol>,
        li: ({ children }) => <li className="mt-0.5">{children}</li>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" className="font-medium text-accent-ink underline underline-offset-2">
            {children}
          </a>
        ),
        code: ({ children }) => <code className="rounded bg-black/[0.06] px-1 py-0.5 font-mono text-[12.5px]">{children}</code>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function MessageGroup({
  item,
  agent,
  visitor,
}: {
  item: Extract<TranscriptItem, { kind: "group" }>;
  agent: Agent;
  visitor: string;
}) {
  const isUser = item.role === "user";
  const last = item.bubbles[item.bubbles.length - 1];
  const userStyle = { background: agent.accent_color, color: textOn(agent.accent_color) };
  return (
    <div className={cn("flex items-end gap-2.5", isUser && "flex-row-reverse")}>
      <div className="mb-[22px] shrink-0">
        {isUser ? <MonsterAvatar seed={visitor} size={28} /> : <AgentAvatar color={agent.accent_color} look={agent.avatar_style} className="size-7" />}
      </div>
      <div className={cn("flex max-w-[min(78%,560px)] flex-col gap-[3px]", isUser ? "items-end" : "items-start")}>
        {item.bubbles.map((bubble, index) => (
          <div
            key={bubble.id}
            className={cn(
              "px-4 py-2.5 text-[14.5px] leading-relaxed text-pretty break-words",
              bubbleShape(item.role, index === 0),
              isUser ? "whitespace-pre-wrap" : "bg-surface-2 text-ink",
            )}
            style={isUser ? userStyle : undefined}
          >
            {isUser ? bubble.content : <AssistantMarkdown content={bubble.content} />}
          </div>
        ))}
        <p className="flex items-center gap-1.5 px-1 pt-1 text-[11.5px] text-faint tabular">
          {last.channel === "voice" && <Mic className="size-3" aria-label="Spoken" />}
          {last.channel === "text" && <Keyboard className="size-3" aria-label="Typed" />}
          {format(new Date(item.bubbles[0].at), "HH:mm")}
          {item.bubbles.some((bubble) => bubble.interrupted) && <span>· Interrupted</span>}
        </p>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-[13px]">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-ink">{children}</dd>
    </div>
  );
}

// ---------- page ----------

export async function ConversationDetail({
  agent,
  conversationId,
  backHref,
}: {
  agent: Agent;
  conversationId: string;
  backHref: string;
}) {
  const [{ data: conversationRow }, { data: messageRows }, { data: insightRows }, { data: actionRows }] = await Promise.all([
    supabaseAdmin.from("conversations").select("*").eq("id", conversationId).eq("agent_id", agent.id).maybeSingle(),
    supabaseAdmin.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(500),
    supabaseAdmin.from("insights").select("*").eq("conversation_id", conversationId).order("created_at"),
    supabaseAdmin.from("actions").select("name, title").eq("agent_id", agent.id),
  ]);
  if (!conversationRow) notFound();

  const conversation = conversationRow as Conversation;
  const messages = (messageRows ?? []) as MessageRow[];
  const insights = (insightRows ?? []) as Insight[];
  const actions = (actionRows ?? []) as Pick<Action, "name" | "title">[] as Action[];
  const transcript = buildTranscript(messages, actions);
  const attributes = Object.entries(conversation.user_attributes ?? {});
  const seed = visitorSeed(conversation);
  const name = visitorName(conversation);
  const device = describeDevice(conversation.user_agent);
  const country = countryName(conversation.country);
  const visitorMessages = messages.filter((message) => message.role === "user").length;
  const insightsHref = backHref.replace(/\/conversations$/, "/insights");
  // Not summarized yet: named after the first question, like in the list.
  const firstQuestion = messages.find((message) => message.role === "user")?.content.trim();
  const title = conversation.title ?? (firstQuestion ? truncate(firstQuestion, 90) : "Conversation");

  return (
    <div className="flex flex-1 flex-col xl:flex-row">
      <article className="min-w-0 flex-1 px-5 py-6 sm:px-10 sm:py-9">
        <div className="mx-auto max-w-[740px]">
          <Link href={backHref} className="mb-5 inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-ink lg:hidden">
            <ArrowLeft className="size-4" /> Conversations
          </Link>

          <h1 className="font-display text-[30px] leading-[1.1] text-balance sm:text-[34px]">{title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[13px] text-muted">
            <span className="flex items-center gap-1.5 font-medium text-ink-2">
              <MonsterAvatar seed={seed} size={20} />
              {name}
            </span>
            {conversation.used_voice && (
              <span className="flex items-center gap-1 tabular">
                <Mic className="size-3.5" /> Call
                {conversation.voice_seconds > 0 && `, ${formatCallTime(conversation.voice_seconds)}`}
              </span>
            )}
            {conversation.used_text && (
              <span className="flex items-center gap-1">
                <Keyboard className="size-3.5" /> Chat
              </span>
            )}
            <span>{format(new Date(conversation.created_at), "MMM d, HH:mm")}</span>
          </div>

          {conversation.summary && (
            <p className="mt-6 rounded-2xl bg-zinc-50 px-5 py-4 text-[14.5px] leading-relaxed text-pretty text-ink-2 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.045)]">
              {conversation.summary}
            </p>
          )}

          {insights.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {insights.map((insight) => (
                <Link
                  key={insight.id}
                  href={insightsHref}
                  className="flex items-center gap-2.5 rounded-xl bg-surface px-3.5 py-2.5 shadow-border transition-shadow duration-150 hover:shadow-border-hover"
                >
                  <Badge tone={insight.type === "handoff" ? "accent" : insight.type === "bug" ? "danger" : "neutral"}>
                    {insight.type === "handoff" ? "Follow-up" : insight.type.replace("_", " ")}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{insight.title}</span>
                  {insight.status === "resolved" && <span className="text-[12px] text-muted">Resolved</span>}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-10 flex flex-col gap-5">
            {transcript.map((item) => {
              switch (item.kind) {
                case "day":
                  return <Divider key={item.key}>{item.label}</Divider>;
                case "page":
                  return (
                    <p key={item.key} className="text-center text-[12px] text-muted">
                      {item.first ? "On " : "Moved to "}
                      <span className="font-mono text-[11.5px] text-ink-2">{item.path}</span>
                    </p>
                  );
                case "event":
                  return <Divider key={item.key}>{item.text}</Divider>;
                case "tool":
                  return <ToolRow key={item.key} item={item} />;
                case "group":
                  return <MessageGroup key={item.key} item={item} agent={agent} visitor={seed} />;
              }
            })}
          </div>
        </div>
      </article>

      <aside className="border-t border-line bg-zinc-50/50 xl:w-[300px] xl:shrink-0 xl:border-t-0 xl:border-l">
        <div className="px-5 py-6 sm:px-10 xl:sticky xl:top-0 xl:px-6 xl:py-9">
          <div className="flex items-center gap-3">
            <MonsterAvatar seed={seed} size={48} />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[15px] font-semibold">
                <span className="truncate">{name}</span>
                {conversation.user_verified && <ShieldCheck className="size-4 shrink-0 text-success-ink" aria-label="Signed in" />}
              </p>
              {conversation.user_name && conversation.user_email ? (
                <p className="truncate text-[13px] text-muted">{conversation.user_email}</p>
              ) : (
                <p className="text-[13px] text-muted">{conversation.user_verified ? "Signed in" : "Not signed in"}</p>
              )}
            </div>
          </div>

          <dl className="mt-5 divide-y divide-line">
            <Fact label="Started">{format(new Date(conversation.created_at), "MMM d, yyyy, HH:mm")}</Fact>
            {conversation.used_voice && conversation.voice_seconds > 0 && (
              <Fact label="Call time">
                <span className="tabular">{formatCallTime(conversation.voice_seconds)}</span>
              </Fact>
            )}
            <Fact label="Messages">
              <span className="tabular">{visitorMessages}</span> from visitor
            </Fact>
            {conversation.page_url && (
              <Fact label="Last page">
                <span className="font-mono text-[12px]" title={conversation.page_url}>
                  {pathOf(conversation.page_url)}
                </span>
              </Fact>
            )}
            {country && (
              <Fact label="Country">
                {countryFlag(conversation.country)} {country}
              </Fact>
            )}
            {device && <Fact label="Device">{device.mobile ? `${device.label}, mobile` : device.label}</Fact>}
            {conversation.referrer && (
              <Fact label="Came from">
                <span title={conversation.referrer}>{hostOf(conversation.referrer)}</span>
              </Fact>
            )}
          </dl>

          {attributes.length > 0 && (
            <details className="group/attributes mt-5" open={attributes.length <= 6}>
              <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                From your site
                <ChevronDown className="size-4 text-faint transition-transform duration-200 group-open/attributes:rotate-180" />
              </summary>
              <dl className="mt-2 divide-y divide-line">
                {attributes.slice(0, 30).map(([key, value]) => (
                  <Fact key={key} label={key}>
                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </Fact>
                ))}
              </dl>
            </details>
          )}
        </div>
      </aside>
    </div>
  );
}
