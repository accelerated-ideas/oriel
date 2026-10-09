"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, ChevronDown, Keyboard, Loader2, Mic, MicOff, Phone, PhoneOff, Sparkles } from "lucide-react";
import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";
import { textOn } from "@/lib/color";
import type { PublicAgentConfig } from "@/lib/widget/public-agent";
import { Avatar } from "./avatar/avatar";
import { createHostBridge, isEmbedded, type HostBridge, type HostInit, type HostPage } from "./host-bridge";
import { streamChat, type ClientToolRequest } from "./stream-chat";
import { VoiceCall, type CallStatus } from "./voice/voice-call";

type DisplayMessage = {
  id: string;
  role: "user" | "assistant" | "activity";
  content: string;
};
type View = "call" | "chat";

let idCounter = 0;
const nextId = () => `m${Date.now()}${idCounter++}`;

const LIVE_STATES: CallStatus[] = ["starting", "blocked", "listening", "thinking", "speaking"];

// A new conversation's greeting types itself out in chat like the replies
// after it: a moment of typing dots, then about 125 characters a second.
const GREETING_DELAY_MS = 350;
const GREETING_CHARS_PER_TICK = 2;
const GREETING_TICK_MS = 16;

// `inline`: shown inside a box on a page (the dashboard playground) rather
// than as a panel the visitor can minimize.
export function WidgetApp({ agentId, hostOrigin, inline = false }: { agentId: string; hostOrigin: string | null; inline?: boolean }) {
  const bridgeRef = useRef<HostBridge | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const initRef = useRef<HostInit | null>(null);
  const pageSyncRef = useRef<Promise<unknown>>(Promise.resolve());
  const chatAbortRef = useRef<AbortController | null>(null);
  const voiceRef = useRef<VoiceCall | null>(null);
  // A new conversation's greeting, held back until it's said (a call) or typed out (chat).
  const pendingGreetingRef = useRef<string | null>(null);
  const finishGreetingRef = useRef<(() => void) | null>(null);

  const [agent, setAgent] = useState<PublicAgentConfig | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [view, setView] = useState<View>("call");
  // The host page's panel is closed, with only the launcher showing.
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState<string | null>(null);
  const [greetingDraft, setGreetingDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [callError, setCallError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [partial, setPartial] = useState("");
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  // Known only in the browser; reading it during render would break hydration.
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => setEmbedded(isEmbedded()), []);

  const inCall = LIVE_STATES.includes(callStatus);

  const addMessage = useCallback((role: DisplayMessage["role"], content: string) => {
    if (!content.trim()) return;
    setMessages((current) => {
      const last = current[current.length - 1];
      if (last && last.role === role && last.content === content) return current;
      return [...current, { id: nextId(), role, content }];
    });
  }, []);

  // Spoken replies grow sentence by sentence, so they're updated in place.
  const upsertMessage = useCallback((id: string, role: DisplayMessage["role"], content: string | null) => {
    setMessages((current) => {
      const index = current.findIndex((message) => message.id === id);
      if (content === null) return index === -1 ? current : current.filter((message) => message.id !== id);
      if (index === -1) return [...current, { id, role, content }];
      const next = [...current];
      next[index] = { id, role, content };
      return next;
    });
  }, []);

  // The page as it is right now, to send with what the visitor says: the page
  // sync can lag behind a click, and a single-page app renders after its URL
  // changes. Older loaders don't answer, so it's only asked when supported.
  const freshPage = useCallback(async () => {
    if (!initRef.current?.pageSnapshots) return null;
    return (await bridgeRef.current?.currentPage()) ?? null;
  }, []);

  const runHostTool = useCallback(async (request: Parameters<HostBridge["runTool"]>[0]) => {
    const bridge = bridgeRef.current;
    if (!bridge) return { ok: false, output: "Not connected to the page." };
    const result = await bridge.runTool(request);
    // Let the server learn about the new page before the assistant continues.
    await pageSyncRef.current;
    return result;
  }, []);

  // Runs a browser-side tool the assistant asked for, with a note in the transcript.
  const executeClientCall = useCallback(
    async (call: ClientToolRequest, mode: "voice" | "text") => {
      if (call.kind === "navigate") {
        addMessage("activity", `Opening ${(call.input.page_title as string) || (call.input.url as string) || "page"}`);
      }
      const result = await runHostTool({
        kind: call.kind as "navigate" | "highlight" | "client_action",
        name: call.name,
        input: call.input,
        toolCallId: call.toolCallId,
        mode,
      });
      if (call.kind === "highlight" && result.ok) addMessage("activity", `Pointed at “${call.input.label}”`);
      if (call.kind === "client_action") {
        addMessage("activity", result.ok ? `Ran ${call.name.replace(/_/g, " ")}` : `Couldn't run ${call.name.replace(/_/g, " ")}`);
      }
      return result;
    },
    [addMessage, runHostTool],
  );

  // ---------- voice ----------
  const startCall = useCallback(
    (resume?: { toolCallId: string | null } | null) => {
      const token = sessionTokenRef.current;
      if (!token) return;
      setView("call");
      if (voiceRef.current) return;
      setCallError(null);
      setMuted(false);
      setPartial("");

      // Message IDs for spoken replies must be unique across calls.
      const callKey = `v${Date.now()}`;
      // What the launcher was last told: the call is live, or waiting for a click to unblock audio.
      let announced: "live" | "paused" | null = null;
      const showOpening = pendingGreetingRef.current !== null;
      const call = new VoiceCall(
        token,
        {
          onStatus: (status, error) => {
            setCallStatus(status);
            if (error) setCallError(error);
            const next = ["listening", "thinking", "speaking"].includes(status) ? "live" : status === "blocked" ? "paused" : null;
            if (next && next !== announced) {
              announced = next;
              bridgeRef.current?.post("call", {
                active: true,
                paused: next === "paused",
              });
            }
            if (status === "idle" || status === "error") {
              if (voiceRef.current === call) voiceRef.current = null;
              setPartial("");
              if (announced) bridgeRef.current?.post("call", { active: false });
            }
          },
          onPartial: setPartial,
          onUserText: (text) => addMessage("user", text),
          onAssistantText: (key, text) => {
            // The first words of the call are the greeting.
            pendingGreetingRef.current = null;
            upsertMessage(`${callKey}-${key}`, "assistant", text);
          },
          onActivity: (label) => addMessage("activity", label),
          runClientTool: (request) => executeClientCall(request, "voice"),
          currentPage: freshPage,
          onEnded: ({ seconds, interrupted, transcription, failed }) => {
            fetch("/api/widget/end", {
              method: "POST",
              body: JSON.stringify({
                sessionToken: token,
                voiceSeconds: seconds,
                reason: "call_ended",
                interrupted,
                transcription,
              }),
              keepalive: true,
            }).catch(() => {});
            // A call that failed stays on the call screen, which shows why.
            if (!failed) setView((current) => (current === "call" ? "chat" : current));
          },
        },
        showOpening,
      );
      voiceRef.current = call;
      void call.start(resume ?? null);
    },
    [addMessage, executeClientCall, upsertMessage, freshPage],
  );

  const endCall = useCallback(() => voiceRef.current?.end(), []);

  // The keyboard button ends the call and carries on in chat.
  const switchToChat = useCallback(() => {
    voiceRef.current?.end();
    setView("chat");
  }, []);

  const callLevel = useCallback(() => voiceRef.current?.level() ?? 0, []);
  const callBands = useCallback(() => voiceRef.current?.voiceBands(7) ?? null, []);

  // Minimized mid-call: the launcher shows the assistant's voice as a moving
  // wave, so it's clear the call is still going. Timers, not animation frames:
  // browsers pause frames in a hidden iframe.
  useEffect(() => {
    if (!minimized || !inCall) return;
    let speaking: boolean | null = null;
    const timer = setInterval(() => {
      const bands = voiceRef.current?.voiceBands(7) ?? null;
      if (!bands && speaking === false) return;
      speaking = Boolean(bands);
      bridgeRef.current?.post("wave", { bands });
    }, 1000 / 30);
    return () => clearInterval(timer);
  }, [minimized, inCall]);

  // Hang up if the widget goes away mid-call.
  useEffect(() => () => voiceRef.current?.end(), []);

  // ---------- text ----------
  const runChat = useCallback(
    async (
      payload: {
        message?: string;
        page?: HostPage;
        toolResults?: { toolCallId: string; output: unknown }[];
      },
      depth = 0,
    ) => {
      const token = sessionTokenRef.current;
      if (!token || depth > 4) return;
      chatAbortRef.current?.abort();
      const controller = new AbortController();
      chatAbortRef.current = controller;
      setBusy(true);
      setDraft("");
      let text = "";
      const pendingCalls: ClientToolRequest[] = [];

      try {
        for await (const event of streamChat({ sessionToken: token, ...payload }, controller.signal)) {
          if (event.type === "text-delta") {
            text += event.text;
            setDraft(text);
          } else if (event.type === "tool-activity") {
            if (text.trim()) {
              addMessage("assistant", text);
              text = "";
              setDraft("");
            }
            addMessage("activity", event.label);
          } else if (event.type === "client-effect") {
            // The ring on the page is the feedback: no activity line splitting the reply.
            void runHostTool({ kind: "highlight", input: event.input, mode: "text" });
          } else if (event.type === "client-tool-calls") {
            pendingCalls.push(...event.calls);
          } else if (event.type === "error") {
            addMessage("activity", event.message || "Something went wrong.");
          }
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") addMessage("activity", "Connection lost. Try again.");
      } finally {
        if (text.trim()) addMessage("assistant", text);
        setDraft(null);
        setBusy(false);
      }

      // The assistant said goodbye and closed the chat; the visitor can still write again.
      if (pendingCalls.some((call) => call.kind === "end_chat")) addMessage("activity", "Chat ended");
      const hostCalls = pendingCalls.filter((call) => call.kind !== "end_chat");
      if (hostCalls.length === 0) return;
      const results: { toolCallId: string; output: unknown }[] = [];
      for (const call of hostCalls) {
        const result = await executeClientCall(call, "text");
        results.push({ toolCallId: call.toolCallId, output: result.output });
      }
      await runChat({ toolResults: results }, depth + 1);
    },
    [addMessage, executeClientCall, runHostTool],
  );

  // Typed out in chat once a call isn't going to say it.
  useEffect(() => {
    const text = pendingGreetingRef.current;
    if (!text || view !== "chat" || inCall) return;
    pendingGreetingRef.current = null;
    let shown = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(timer);
      finishGreetingRef.current = null;
      setGreetingDraft(null);
      addMessage("assistant", text);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return finish();
    const tick = () => {
      shown += GREETING_CHARS_PER_TICK;
      if (shown >= text.length) return finish();
      setGreetingDraft(text.slice(0, shown));
      timer = setTimeout(tick, GREETING_TICK_MS);
    };
    finishGreetingRef.current = finish;
    setGreetingDraft("");
    timer = setTimeout(tick, GREETING_DELAY_MS);
    return () => finishGreetingRef.current?.();
  }, [view, inCall, addMessage]);

  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      // Typed before the greeting finished: it comes first.
      finishGreetingRef.current?.();
      addMessage("user", trimmed);
      void freshPage().then((page) => runChat({ message: trimmed, ...(page && { page }) }));
    },
    [addMessage, runChat, freshPage],
  );

  // ---------- session ----------
  const openSession = useCallback(
    async (init: HostInit) => {
      const response = await fetch("/api/widget/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId,
          visitorId: init.visitorId,
          conversationId: init.conversationId ?? null,
          hostOrigin,
          page: init.page,
          identity: init.identity,
          preview: init.preview ?? false,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "This assistant isn't available right now.");
      sessionTokenRef.current = data.sessionToken;
      setAgent(data.agent);
      bridgeRef.current?.post("config", data.agent);
      bridgeRef.current?.post("session", {
        conversationId: data.conversationId,
      });
      const rows = data.messages as {
        id: string;
        role: "user" | "assistant";
        content: string;
      }[];
      // A new conversation's greeting is shown as it's said or typed, like the replies after it.
      const fresh = data.created && rows.length === 1 && rows[0].role === "assistant";
      pendingGreetingRef.current = fresh ? rows[0].content : null;
      setMessages(fresh ? [] : rows.map((message) => ({ ...message })));
      return data as { agent: PublicAgentConfig; messages: { role: string }[] };
    },
    [agentId, hostOrigin],
  );

  const handleInit = useCallback(
    async (init: HostInit) => {
      initRef.current = init;
      setMinimized(init.open === false);
      try {
        const data = await openSession(init);
        const voiceEnabled = data.agent.voiceEnabled;

        if (init.resume) {
          const { toolCallId } = init.resume;
          if (init.mode === "voice" && voiceEnabled) startCall(init.resume);
          else {
            setView("chat");
            if (toolCallId) {
              void runChat({
                toolResults: [
                  {
                    toolCallId,
                    output: `Done, you moved them to ${init.page.title || init.page.url}.`,
                  },
                ],
              });
            }
          }
          return;
        }
        // Conversations start as a call; chat only when asked for (the
        // launcher's keyboard button) or when voice isn't available.
        if (init.mode === "voice" && voiceEnabled) startCall();
        else setView("chat");
      } catch (error) {
        setBootError(error instanceof Error ? error.message : "Something went wrong.");
      }
    },
    [openSession, runChat, startCall],
  );

  const syncPage = useCallback((page: HostPage) => {
    const token = sessionTokenRef.current;
    if (!token) return;
    pageSyncRef.current = fetch("/api/widget/page", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionToken: token, page }),
    }).catch(() => {});
  }, []);

  // Wire up the host bridge once.
  const handlersRef = useRef({ handleInit, startCall, syncPage, openSession });
  handlersRef.current = { handleInit, startCall, syncPage, openSession };

  useEffect(() => {
    const bridge = createHostBridge(hostOrigin);
    bridgeRef.current = bridge;

    bridge.on<HostInit>("init", (init) => {
      // One init per page load (dev StrictMode mounts twice and says "ready" twice).
      if (initRef.current) return;
      void handlersRef.current.handleInit(init);
    });
    bridge.on<{ mode: "voice" | "text"; autostart: boolean }>("open", ({ mode }) => {
      setMinimized(false);
      if (mode === "voice") {
        voiceRef.current?.continueIfBlocked();
        handlersRef.current.startCall();
      } else setView("chat");
    });
    // The assistant reads the current page on every turn, so syncing is enough.
    bridge.on<HostPage>("page", (page) => handlersRef.current.syncPage(page));
    bridge.on<{ token?: string; name?: string; email?: string }>("identity", (identity) => {
      if (!initRef.current) return;
      initRef.current = { ...initRef.current, identity };
      void handlersRef.current.openSession(initRef.current).catch(() => {});
    });
    bridge.on<{ url: string }>("navigating", ({ url }) => {
      try {
        setNavigatingTo(new URL(url).pathname);
      } catch {
        setNavigatingTo(url);
      }
    });
    bridge.on("closed", () => {
      setMinimized(true);
      if (!voiceRef.current && sessionTokenRef.current) {
        fetch("/api/widget/end", {
          method: "POST",
          body: JSON.stringify({
            sessionToken: sessionTokenRef.current,
            reason: "closed",
          }),
          keepalive: true,
        }).catch(() => {});
      }
    });

    if (isEmbedded()) {
      bridge.post("ready");
    } else {
      // Opened directly (e.g. for testing): use this page as the host.
      let visitorId = "";
      try {
        visitorId = localStorage.getItem(`${BRAND.messagePrefix}:standalone-vid`) ?? "";
        if (!visitorId) {
          visitorId = crypto.randomUUID();
          localStorage.setItem(`${BRAND.messagePrefix}:standalone-vid`, visitorId);
        }
      } catch {
        visitorId = crypto.randomUUID();
      }
      void handlersRef.current.handleInit({
        visitorId,
        page: { url: location.href, title: document.title },
        identity: {},
        mode: "voice",
        autostart: true,
        resume: null,
        preview: true,
      });
    }
    return () => bridge.dispose();
  }, [hostOrigin]);

  const accent = agent?.accentColor ?? "#6352F2";
  const style = {
    "--accent": accent,
    "--on-accent": textOn(accent),
  } as React.CSSProperties;
  const close = () => bridgeRef.current?.post("close");

  if (bootError) {
    return (
      <Shell style={style} onClose={close} embedded={embedded && !inline}>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <p className="font-display text-[22px]">Unavailable</p>
          <p className="text-[14px] text-muted">{bootError}</p>
        </div>
      </Shell>
    );
  }

  if (!agent) {
    return (
      <Shell style={style} onClose={close} embedded={embedded && !inline}>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell style={style} onClose={close} embedded={embedded && !inline}>
      {navigatingTo && (
        <div className="absolute inset-x-0 top-4 z-10 flex justify-center">
          <div className="flex items-center gap-2 rounded-full bg-ink px-3 py-1.5 text-[12.5px] text-white shadow-pop animate-rise-in">
            <Loader2 className="size-3.5 animate-spin" /> Opening {navigatingTo}
          </div>
        </div>
      )}

      <ConversationView
        agent={agent}
        mode={view}
        status={callStatus}
        error={callError}
        messages={messages}
        partial={partial}
        draft={draft ?? greetingDraft}
        busy={busy}
        muted={muted}
        level={callLevel}
        bands={callBands}
        onToggleMute={() => {
          const next = !muted;
          setMuted(next);
          voiceRef.current?.setMuted(next);
        }}
        onContinue={() => voiceRef.current?.continueAfterGesture()}
        onEnd={endCall}
        onRetry={() => startCall()}
        onType={switchToChat}
        onSend={sendText}
        onCall={agent.voiceEnabled ? () => startCall() : undefined}
        onNavigate={(url) => void runHostTool({ kind: "navigate", input: { url } })}
      />
    </Shell>
  );
}

// The panel itself. No header: the assistant's name sits under its avatar, and
// minimizing is a button in the corner (only in the panel on a site).
function Shell({
  embedded,
  onClose,
  style,
  children,
}: {
  embedded: boolean;
  onClose: () => void;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div style={style} className="relative flex h-dvh flex-col overflow-hidden bg-surface text-ink">
      {embedded && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 flex size-9 items-center justify-center rounded-full text-muted transition-[background-color,color,scale] duration-150 ease-out hover:bg-surface-2 hover:text-ink active:scale-[0.96]"
          aria-label="Minimize"
          title="Minimize"
        >
          <ChevronDown className="size-5" />
        </button>
      )}
      {children}
    </div>
  );
}

// One screen for both ways of talking. On a call the avatar is large and the
// bottom bar has call controls; in chat it shrinks and the bar becomes a
// text box. Messages look the same either way.
function ConversationView({
  agent,
  mode,
  status,
  error,
  messages,
  partial,
  draft,
  busy,
  muted,
  level,
  bands,
  onToggleMute,
  onContinue,
  onEnd,
  onRetry,
  onType,
  onSend,
  onCall,
  onNavigate,
}: {
  agent: PublicAgentConfig;
  mode: View;
  status: CallStatus;
  error: string | null;
  messages: DisplayMessage[];
  partial: string;
  draft: string | null;
  busy: boolean;
  muted: boolean;
  level: () => number;
  bands: () => number[] | null;
  onToggleMute: () => void;
  onContinue: () => void;
  onEnd: () => void;
  onRetry: () => void;
  onType: () => void;
  onSend: (text: string) => void;
  // Starts a call from chat; missing when voice is off.
  onCall?: () => void;
  onNavigate: (url: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const onCallView = mode === "call";
  const connected = status === "listening" || status === "thinking" || status === "speaking";

  // Stays at the bottom as replies stream in and captions grow, unless the
  // visitor scrolls up to read; scrolling back down picks it up again.
  const pinnedRef = useRef(true);
  const userScrollRef = useRef({ at: 0, dragging: false });
  const toBottom = useCallback(() => {
    const list = listRef.current;
    if (list && pinnedRef.current) list.scrollTop = list.scrollHeight;
  }, []);
  // Follows the content's height, whatever made it grow, and the list's own
  // size (the avatar shrinking after a call).
  const followContent = useCallback(
    (content: HTMLDivElement | null) => {
      if (!content) return;
      toBottom();
      const observer = new ResizeObserver(toBottom);
      observer.observe(content);
      if (content.parentElement) observer.observe(content.parentElement);
      return () => observer.disconnect();
    },
    [toBottom],
  );
  const noteUserScroll = () => {
    userScrollRef.current.at = Date.now();
  };
  const onListScroll = () => {
    const list = listRef.current;
    const { at, dragging } = userScrollRef.current;
    // Only the visitor's own scrolling decides; ours just follows.
    if (!list || (!dragging && Date.now() - at > 800)) return;
    pinnedRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  };

  // Sending or switching between call and chat brings the latest back into view.
  useEffect(() => {
    pinnedRef.current = true;
    toBottom();
  }, [mode, toBottom]);
  const send = (text: string) => {
    pinnedRef.current = true;
    onSend(text);
  };

  const label =
    status === "starting"
      ? "Connecting…"
      : status === "blocked"
        ? "Paused while the page loaded"
        : status === "error"
          ? "Call ended"
          : muted
            ? "You're muted"
            : status === "speaking"
              ? "Speaking"
              : status === "thinking"
                ? "Thinking…"
                : "Listening";

  const avatarState = onCallView
    ? status === "starting" || status === "blocked"
      ? "connecting"
      : status === "speaking"
        ? "speaking"
        : status === "thinking"
          ? "thinking"
          : "listening"
    : busy
      ? "thinking"
      : "idle";

  return (
    <div className="flex min-h-0 flex-1 flex-col animate-fade-in">
      <div className={cn("flex shrink-0 flex-col items-center transition-[padding] duration-300", onCallView ? "pt-10" : "pt-6")}>
        <Avatar
          look={agent.avatarStyle}
          color={agent.accentColor}
          size={onCallView ? 168 : 60}
          level={onCallView && connected ? level : undefined}
          bands={onCallView && connected ? bands : undefined}
          state={avatarState}
        />
        <p className={cn("max-w-full truncate px-12 text-[15px] font-semibold", onCallView ? "mt-4" : "mt-2.5")}>{agent.assistantName}</p>
        {onCallView && (
          <p className="mt-0.5 text-[13.5px] text-muted" aria-live="polite">
            {label}
          </p>
        )}
        {onCallView && status === "blocked" && (
          <button
            type="button"
            onClick={onContinue}
            className="mt-3 rounded-full px-4 py-2 text-[14px] font-semibold transition-transform active:scale-[0.98]"
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}
          >
            Continue the call
          </button>
        )}
      </div>

      {onCallView && error ? (
        <div className="mx-5 mt-6 rounded-2xl bg-surface-2 p-4 text-center text-[14px] leading-relaxed text-ink-2">
          {error}
          <div className="mt-3 flex justify-center gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            >
              Try again
            </button>
            {agent.textModeEnabled && (
              <button type="button" onClick={onType} className="rounded-full px-3.5 py-1.5 text-[13px] font-medium hover:bg-surface-3">
                Type instead
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          ref={listRef}
          onScroll={onListScroll}
          onWheel={noteUserScroll}
          onTouchMove={noteUserScroll}
          onKeyDown={noteUserScroll}
          onPointerDown={() => {
            userScrollRef.current.dragging = true;
            window.addEventListener("pointerup", () => (userScrollRef.current.dragging = false), { once: true });
          }}
          className="mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-2 pb-4 scrollbar-thin [mask-image:linear-gradient(to_bottom,transparent,black_20px)]"
        >
          <div ref={followContent} className="flex flex-col">
            {messages.map((message, index) => {
              if (message.role === "activity") return <ActivityLine key={message.id} text={message.content} />;
              const role = message.role;
              const isLast = index === messages.length - 1;
              const continues = messages[index + 1]?.role === role || (isLast && (role === "user" ? Boolean(partial) : draft !== null));
              return (
                <Bubble
                  key={message.id}
                  role={role}
                  content={message.content}
                  first={messages[index - 1]?.role !== role}
                  last={!continues}
                  onNavigate={onNavigate}
                />
              );
            })}
            {partial && (
              <Bubble
                role="user"
                content={partial}
                pending
                first={messages[messages.length - 1]?.role !== "user"}
                last
                onNavigate={onNavigate}
              />
            )}
            {draft !== null &&
              (draft ? (
                <Bubble
                  role="assistant"
                  content={draft}
                  first={messages[messages.length - 1]?.role !== "assistant"}
                  last
                  onNavigate={onNavigate}
                />
              ) : (
                <TypingBubble first={messages[messages.length - 1]?.role !== "assistant"} />
              ))}
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-line">
        <div className={cn("flex items-end justify-center gap-3 px-4", agent.branding ? "pt-4 pb-1.5" : "py-4")}>
          {onCallView ? (
            <>
              <RoundButton label={muted ? "Unmute" : "Mute"} onClick={onToggleMute} active={muted} disabled={!connected}>
                {muted ? <MicOff /> : <Mic />}
              </RoundButton>
              <button
                type="button"
                onClick={onEnd}
                disabled={status === "error" || status === "idle"}
                className="flex size-14 items-center justify-center rounded-full bg-danger text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_8px_20px_-8px_rgb(220_38_38/0.7)] transition-[background-color,scale] duration-150 ease-out hover:bg-red-700 active:scale-[0.96] disabled:opacity-40"
                aria-label="End call"
              >
                <PhoneOff className="size-5" />
              </button>
              {agent.textModeEnabled ? (
                <RoundButton label="Switch to typing" onClick={onType}>
                  <Keyboard />
                </RoundButton>
              ) : (
                <span className="size-12" />
              )}
            </>
          ) : (
            <Composer agent={agent} busy={busy} onSend={send} onCall={onCall} />
          )}
        </div>
        {agent.branding && <PoweredBy />}
      </div>
    </div>
  );
}

// Our site, in a new tab. Plans that allow it can hide this (Install > Appearance).
function PoweredBy() {
  return (
    <div className="flex justify-center pb-2">
      <a
        href={`${BRAND.siteUrl}/?utm_source=widget&utm_medium=powered_by`}
        target="_blank"
        rel="noopener"
        className="rounded-md px-2 py-1 text-[11.5px] text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        Powered by <span className="font-semibold">{BRAND.name}</span>
      </a>
    </div>
  );
}

function Composer({
  agent,
  busy,
  onSend,
  onCall,
}: {
  agent: PublicAgentConfig;
  busy: boolean;
  onSend: (text: string) => void;
  onCall?: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    if (!value.trim() || busy) return;
    onSend(value);
    setValue("");
  };

  return (
    <div className="flex w-full items-end gap-2">
      <div className="flex min-h-12 flex-1 items-center rounded-3xl border border-line-strong bg-surface px-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--accent)] focus-within:ring-[3px] focus-within:ring-[color-mix(in_srgb,var(--accent)_16%,transparent)]">
        <textarea
          ref={inputRef}
          value={value}
          rows={1}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={`Message ${agent.assistantName}`}
          className="max-h-32 flex-1 resize-none bg-transparent py-3 text-[14.5px] leading-snug [field-sizing:content] placeholder:text-faint focus:outline-none"
        />
      </div>
      {onCall && (
        <RoundButton label="Call" onClick={onCall}>
          <Phone />
        </RoundButton>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={!value.trim() || busy}
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_6px_16px_-6px_color-mix(in_srgb,var(--accent)_70%,transparent)] transition-[opacity,scale] duration-150 ease-out active:scale-[0.96] disabled:opacity-40 disabled:shadow-none"
        aria-label="Send"
        title="Send"
      >
        <ArrowUp className="size-5" />
      </button>
    </div>
  );
}

function RoundButton({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-12 items-center justify-center rounded-full transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] disabled:opacity-40 [&_svg]:size-5",
        active ? "bg-ink text-white hover:bg-zinc-800" : "bg-surface text-ink shadow-border hover:bg-zinc-50",
      )}
    >
      {children}
    </button>
  );
}

function ActivityLine({ text }: { text: string }) {
  return (
    <div className="mt-3 flex justify-center first:mt-0 animate-rise-in">
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-zinc-50 px-2.5 py-1 text-[12px] font-medium text-muted shadow-[inset_0_0_0_1px_rgb(0_0_0/0.05)]">
        <Sparkles className="size-3.5 shrink-0" style={{ color: "var(--accent)" }} />
        <span className="truncate">{text}</span>
      </span>
    </div>
  );
}

// Bubbles in a run from the same side sit close together. Only the first in a
// run has a fully rounded top on its side; the bottom corner is the tail.
function bubbleShape(role: "user" | "assistant", first: boolean) {
  return role === "user"
    ? cn("rounded-[20px] rounded-br-md", !first && "rounded-tr-md")
    : cn("rounded-[20px] rounded-bl-md", !first && "rounded-tl-md");
}

function TypingBubble({ first }: { first: boolean }) {
  return (
    <div className={cn("flex animate-rise-in", first ? "mt-3 first:mt-0" : "mt-1")} aria-label="Typing">
      <div className={cn("flex gap-1 bg-surface-2 px-4 py-3.5", bubbleShape("assistant", first))}>
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="size-1.5 animate-bounce rounded-full bg-faint" style={{ animationDelay: `${dot * 120}ms` }} />
        ))}
      </div>
    </div>
  );
}

function Bubble({
  role,
  content,
  pending,
  first,
  last,
  onNavigate,
}: {
  role: "user" | "assistant";
  content: string;
  // Still being spoken: the live transcript of what the user is saying.
  pending?: boolean;
  first: boolean;
  last: boolean;
  onNavigate: (url: string) => void;
}) {
  const spacing = first ? "mt-3 first:mt-0" : "mt-1";
  if (role === "user") {
    return (
      <div className={cn("flex justify-end pl-10 animate-rise-in", spacing)} data-last={last || undefined}>
        <p
          className={cn(
            "bg-[var(--accent)] px-3.5 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap text-[var(--on-accent)] shadow-[inset_0_1px_0_rgb(255_255_255/0.14)] transition-opacity duration-150",
            bubbleShape("user", first),
            pending && "opacity-55",
          )}
        >
          {content}
        </p>
      </div>
    );
  }
  return (
    <div className={cn("flex pr-8 animate-rise-in", spacing)} data-last={last || undefined}>
      <div
        className={cn(
          "min-w-0 bg-surface-2 px-3.5 py-2.5 text-[14.5px] leading-relaxed text-ink [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
          bubbleShape("assistant", first),
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a
                href={href}
                onClick={(event) => {
                  if (!href) return;
                  event.preventDefault();
                  onNavigate(href);
                }}
                className="font-medium underline decoration-[var(--accent)] decoration-2 underline-offset-2"
              >
                {children}
              </a>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
