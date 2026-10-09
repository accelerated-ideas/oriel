"use client";
import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { BRAND } from "@/config/brand";
import { Button } from "@/components/ui/button";

const HOST = `${BRAND.messagePrefix}-host`;
const WIDGET = `${BRAND.messagePrefix}-widget`;

function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the conversation just won't survive a reload.
  }
}

// The assistant's real widget, in a box on this page. Plays the part the
// embed script plays on a website: starts the widget, keeps its conversation,
// and answers its requests. There's no site here, so in-page tools decline.
export function Playground({ agentId, siteUrl, siteName }: { agentId: string; siteUrl: string; siteName: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [run, setRun] = useState(0);
  const [origin, setOrigin] = useState<string | null>(null);
  const conversationKey = `${BRAND.messagePrefix}:playground:${agentId}`;

  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    const post = (type: string, payload: unknown) =>
      frameRef.current?.contentWindow?.postMessage({ source: HOST, type, payload }, window.location.origin);

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { source?: string; type?: string; payload?: Record<string, unknown> } | null;
      if (!data || data.source !== WIDGET) return;
      if (data.type === "ready") {
        let visitorId = stored(`${BRAND.messagePrefix}:playground-visitor`);
        if (!visitorId) {
          visitorId = crypto.randomUUID();
          store(`${BRAND.messagePrefix}:playground-visitor`, visitorId);
        }
        post("init", {
          visitorId,
          conversationId: stored(conversationKey),
          // The assistant answers as if the visitor were on the site's home page.
          page: { url: siteUrl || window.location.href, title: siteName, text: null, referrer: null },
          identity: {},
          mode: "text",
          autostart: false,
          resume: null,
          preview: true,
          open: true,
        });
      } else if (data.type === "session") {
        store(conversationKey, String(data.payload?.conversationId ?? ""));
      } else if (data.type === "tool") {
        const kind = data.payload?.kind;
        post("tool-result", {
          requestId: data.payload?.requestId,
          ok: false,
          output:
            kind === "client_action"
              ? "Actions from the site's own code don't run in the playground. Say it would run on the site."
              : "The playground isn't the site, so this can't happen here. Say what would happen on the site instead.",
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [conversationKey, siteName, siteUrl]);

  const startOver = () => {
    store(conversationKey, null);
    setRun((value) => value + 1);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="h-[min(720px,calc(100dvh-220px))] min-h-[520px] overflow-hidden rounded-[28px] bg-surface shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_8px_16px_-4px_rgb(0_0_0/0.08),0_32px_72px_-16px_rgb(0_0_0/0.24)]">
        {origin && (
          <iframe
            key={run}
            ref={frameRef}
            title="Playground"
            src={`/widget/${agentId}?origin=${encodeURIComponent(origin)}&inline=1`}
            allow="microphone; autoplay; clipboard-write"
            className="block size-full border-0"
          />
        )}
      </div>
      <Button variant="ghost" size="sm" className="self-center" onClick={startOver}>
        <RotateCcw /> New conversation
      </Button>
    </div>
  );
}
