import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/config/brand";
import { authorizeAgent } from "@/lib/auth/access";
import { getUser } from "@/lib/auth/get-user";
import { signToken } from "@/lib/crypto";
import { isProviderId } from "@/lib/integrations/catalog";
import { adapterFor } from "@/lib/integrations/providers";
import { loadConnection } from "@/lib/integrations/store";

export const dynamic = "force-dynamic";

// Sends a workspace member to a service (Slack, Salesforce…) to approve access
// for one assistant. Stripe has its own route.
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const agentId = request.nextUrl.searchParams.get("agentId") ?? "";
  if (!isProviderId(provider)) return NextResponse.json({ error: "Unknown integration" }, { status: 404 });
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/auth", request.url));
  const access = await authorizeAgent(agentId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: 403 });

  const adapter = adapterFor(provider);
  const existing = await loadConnection(agentId, provider);
  // A pending connection carries the customer's own app (Zendesk, Salesforce).
  const ownApp = Boolean(existing?.metadata.pending && existing.secret.client_id);
  if (!adapter.authorizeUrl || !(ownApp || adapter.oauthConfigured?.())) {
    return NextResponse.json({ error: `Connecting ${provider} isn't set up on this server.` }, { status: 503 });
  }
  // Anything else in the query is what the owner entered first (a Salesforce address).
  const extra = Object.fromEntries(
    [...request.nextUrl.searchParams].filter(([key]) => key !== "agentId").map(([key, value]) => [key, value.trim()]),
  );
  const problem = adapter.checkExtra?.(extra);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const state = signToken("integration-connect", { agentId, userId: user.id, provider, extra }, 15 * 60);
  return NextResponse.redirect(adapter.authorizeUrl(state, appUrl(`/api/integrations/${provider}/callback`), extra, existing));
}
