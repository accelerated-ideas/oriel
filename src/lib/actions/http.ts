import "server-only";
import { decryptSecret } from "@/lib/crypto";
import { assertPublicUrl } from "@/lib/actions/ssrf";
import { renderTemplate, type TemplateScope } from "@/lib/actions/template";
import { truncate } from "@/lib/utils";

const TIMEOUT_MS = 10_000;
const MAX_RESULT_CHARS = 4_000;

export type StoredHttpConfig = {
  method?: string;
  url?: string;
  body?: string;
  // Header values are encrypted at rest.
  headers?: { key: string; value_encrypted: string; preview: string }[];
};

export async function executeHttpAction(config: StoredHttpConfig, scope: TemplateScope) {
  const method = (config.method ?? "GET").toUpperCase();
  const url = renderTemplate(config.url ?? "", scope, "url");
  await assertPublicUrl(url);

  const headers: Record<string, string> = { accept: "application/json, text/plain;q=0.9, */*;q=0.5" };
  for (const header of config.headers ?? []) {
    if (!header.key) continue;
    headers[header.key] = renderTemplate(decryptSecret(header.value_encrypted), scope, "raw");
  }

  let body: string | undefined;
  if (method !== "GET" && method !== "DELETE" && config.body?.trim()) {
    body = renderTemplate(config.body, scope, "json");
    if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
      headers["content-type"] = "application/json";
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { method, headers, body, signal: controller.signal, redirect: "manual" });
    const text = await response.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      // Keep plain text.
    }
    const serialized = typeof data === "string" ? data : JSON.stringify(data);
    return {
      ok: response.ok,
      status: response.status,
      data: serialized.length > MAX_RESULT_CHARS ? truncate(serialized, MAX_RESULT_CHARS) : data,
    };
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, status: 0, data: "The request timed out." };
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
