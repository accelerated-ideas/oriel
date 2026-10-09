"use client";
import { BRAND } from "@/config/brand";

export type HostPage = {
  url: string;
  title?: string | null;
  text?: string | null;
  links?: { text: string; url: string }[] | null;
  referrer?: string | null;
};
export type HostIdentity = { token?: string; name?: string; email?: string };

export type HostInit = {
  visitorId: string;
  conversationId?: string | null;
  page: HostPage;
  identity: HostIdentity;
  mode: "voice" | "text";
  autostart: boolean;
  // Continuing a call after a full page load (see VoiceCall.start).
  resume: { toolCallId: string | null } | null;
  // Whether the panel is showing; false when a call carries on minimized.
  open?: boolean;
  preview?: boolean;
  // The host answers "page-request" (loaders from before it didn't).
  pageSnapshots?: boolean;
};

export type ToolRequest = {
  kind: "navigate" | "highlight" | "client_action";
  name?: string;
  input: Record<string, unknown>;
  toolCallId?: string;
  mode?: "voice" | "text";
};

const HOST_SOURCE = `${BRAND.messagePrefix}-host`;
const WIDGET_SOURCE = `${BRAND.messagePrefix}-widget`;

export function isEmbedded() {
  return typeof window !== "undefined" && window.parent !== window;
}

export function createHostBridge(hostOrigin: string | null) {
  const pending = new Map<string, (result: { ok: boolean; output: string }) => void>();
  const pendingPages = new Map<string, (page: HostPage | null) => void>();
  const handlers = new Map<string, (payload: never) => void>();
  let counter = 0;

  function post(type: string, payload: unknown = {}) {
    if (!isEmbedded() || !hostOrigin) return;
    window.parent.postMessage({ source: WIDGET_SOURCE, type, payload }, hostOrigin);
  }

  function onMessage(event: MessageEvent) {
    if (!isEmbedded() || event.source !== window.parent) return;
    if (hostOrigin && event.origin !== hostOrigin) return;
    const data = event.data as { source?: string; type?: string; payload?: unknown } | null;
    if (!data || data.source !== HOST_SOURCE || !data.type) return;

    if (data.type === "tool-result") {
      const payload = data.payload as { requestId: string; ok: boolean; output: string };
      pending.get(payload.requestId)?.({ ok: payload.ok, output: payload.output });
      pending.delete(payload.requestId);
      return;
    }
    if (data.type === "page-snapshot") {
      const payload = data.payload as { requestId: string; page: HostPage };
      pendingPages.get(payload.requestId)?.(payload.page ?? null);
      pendingPages.delete(payload.requestId);
      return;
    }
    handlers.get(data.type)?.(data.payload as never);
  }

  window.addEventListener("message", onMessage);

  return {
    post,
    on<T>(type: string, handler: (payload: T) => void) {
      handlers.set(type, handler as (payload: never) => void);
    },
    // Runs a browser-side tool on the host page and waits for its result.
    runTool(request: ToolRequest, timeoutMs = 30_000) {
      if (!isEmbedded()) {
        return Promise.resolve({ ok: false, output: "Not running on a website, so this can't be done here." });
      }
      const requestId = `t${Date.now()}${counter++}`;
      return new Promise<{ ok: boolean; output: string }>((resolve) => {
        pending.set(requestId, resolve);
        post("tool", { requestId, ...request });
        setTimeout(() => {
          if (pending.has(requestId)) {
            pending.delete(requestId);
            resolve({ ok: false, output: "The page didn't respond in time." });
          }
        }, timeoutMs);
      });
    },
    // The host page as it is right now, or null if it doesn't answer quickly.
    currentPage(timeoutMs = 400) {
      if (!isEmbedded()) return Promise.resolve(null);
      const requestId = `p${Date.now()}${counter++}`;
      return new Promise<HostPage | null>((resolve) => {
        pendingPages.set(requestId, resolve);
        post("page-request", { requestId });
        setTimeout(() => {
          if (!pendingPages.has(requestId)) return;
          pendingPages.delete(requestId);
          resolve(null);
        }, timeoutMs);
      });
    },
    dispose() {
      window.removeEventListener("message", onMessage);
    },
  };
}

export type HostBridge = ReturnType<typeof createHostBridge>;
