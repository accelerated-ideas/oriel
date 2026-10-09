"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/config/brand";
import { actionListAssistants } from "@/server-actions/agents";

type Embed = (...args: unknown[]) => void;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const simplify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// The help assistant's site map uses {workspace} and {assistant} in its paths
// (src/content/app-assistant/site-map.ts). {workspace} is the one the user is
// in. {assistant} is the one they're in, or the workspace's only assistant;
// with several, the help assistant puts the assistant's name in its place.
// When it can't tell which, this throws and the help assistant reads why.
async function dashboardPath(requested: string) {
  const path = decodeURIComponent(requested);
  const here = window.location.pathname.match(/^\/account\/([0-9a-f-]{36})(?:\/agents\/([0-9a-f-]{36}))?/);
  const workspace = here?.[1];
  const current = here?.[2];
  if (!workspace) return "/account";
  const resolved = path.replaceAll("{workspace}", workspace);
  const inside = resolved.match(/^\/account\/[^/]+\/agents\/([^/?#]+)(.*)$/);
  if (!inside) return resolved;
  const [, segment, rest] = inside;
  if (ID.test(segment)) return resolved;
  if (segment === "{assistant}" && current) return `/account/${workspace}/agents/${current}${rest}`;

  const result = await actionListAssistants(workspace);
  if (!result.ok) throw new Error(result.error);
  const assistants = result.data.assistants;
  const names = assistants
    .map((assistant) => (assistant.siteName ? `${assistant.assistantName} (${assistant.siteName})` : assistant.assistantName))
    .join(", ");
  if (assistants.length === 0) throw new Error("This workspace has no assistants yet. Create one on the Assistants page first.");
  if (segment === "{assistant}") {
    if (assistants.length === 1) return `/account/${workspace}/agents/${assistants[0].id}${rest}`;
    throw new Error(
      `This workspace has ${assistants.length} assistants: ${names}. Ask which one, then use its name in place of {assistant}, like /account/{workspace}/agents/${assistants[0].assistantName}${rest || "/install"}.`,
    );
  }
  const wanted = simplify(segment);
  const match = assistants.find((assistant) =>
    [assistant.assistantName, assistant.siteName].some((name) => name && simplify(name) === wanted),
  );
  if (!match) throw new Error(`There's no assistant called "${segment}" in this workspace. It has: ${names}.`);
  return `/account/${workspace}/agents/${match.id}${rest}`;
}

// Resolves once the dashboard shows the page (the URL changes when the new page
// renders), so the help assistant reports where the user really is.
function arrivedAt(path: string) {
  const target = path.split(/[?#]/)[0];
  return new Promise<void>((resolve) => {
    const started = Date.now();
    const check = () => {
      if (window.location.pathname === target || Date.now() - started > 8000) resolve();
      else setTimeout(check, 50);
    };
    check();
  });
}

// Dialogs and side panels put their main button where the bubble sits. Radix
// marks everything outside an open one aria-hidden, the bubble included: hide
// it then, unless the assistant is open or on a call.
function stepAsideForDialogs(embed: Embed) {
  const host = document.querySelector<HTMLElement>(`[data-${BRAND.messagePrefix}-widget]`);
  if (!host) return;
  let engaged = { open: false, call: false };
  const update = () => {
    const covered = host.getAttribute("aria-hidden") === "true" && !engaged.open && !engaged.call;
    host.style.display = covered ? "none" : "";
  };
  new MutationObserver(update).observe(host, { attributes: true, attributeFilter: ["aria-hidden"] });
  embed("on", "open", () => {
    engaged = { ...engaged, open: true };
    update();
  });
  embed("on", "close", () => {
    engaged = { ...engaged, open: false };
    update();
  });
  embed("on", "call", (payload: { active?: boolean }) => {
    engaged = { ...engaged, call: !!payload?.active };
    update();
  });
}

// Loads the help assistant's bubble once for the whole dashboard. It moves
// between dashboard pages without a reload, so a call carries on.
export function AppAssistant({ agentId, token }: { agentId: string; token: string | null }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (document.querySelector("script[data-app-assistant]")) return;
    const script = document.createElement("script");
    script.src = "/embed.js";
    script.async = true;
    script.dataset.agentId = agentId;
    script.dataset.appAssistant = "";
    script.onload = () => {
      const embed = (window as unknown as Record<string, Embed | undefined>)[BRAND.embedGlobal];
      if (!embed) return;
      embed("setNavigator", async (path: string) => {
        const target = await dashboardPath(path);
        routerRef.current.push(target);
        await arrivedAt(target);
      });
      if (token) embed("identify", { token });
      stepAsideForDialogs(embed);
    };
    document.body.appendChild(script);
  }, [agentId, token]);

  return null;
}
