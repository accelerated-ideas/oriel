"use client";

export type ClientToolRequest = {
  toolCallId: string;
  kind: "navigate" | "highlight" | "end_call" | "end_chat" | "client_action";
  name: string;
  input: Record<string, unknown>;
};

export type ChatStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-activity"; toolCallId: string; name: string; label: string }
  | { type: "client-tool-calls"; calls: ClientToolRequest[] }
  // Pointing at something as the reply mentions it (an inline marker), no result needed.
  | { type: "client-effect"; toolCallId: string; name: "highlight"; input: { label: string } }
  | { type: "finish" }
  | { type: "error"; message: string };

// POSTs JSON and yields each server-sent event's JSON payload.
export async function* streamEvents<T extends { type: string }>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<T | { type: "error"; message: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    yield { type: "error", message: data?.error ?? "Something went wrong. Try again." };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
      if (!frame.startsWith("data:")) continue;
      try {
        yield JSON.parse(frame.slice(5).trim()) as T;
      } catch {
        // Ignore malformed frames.
      }
    }
  }
}

export function streamChat(
  body: { sessionToken: string; message?: string; toolResults?: { toolCallId: string; output: unknown }[] },
  signal?: AbortSignal,
) {
  return streamEvents<ChatStreamEvent>("/api/widget/chat", body, signal);
}
