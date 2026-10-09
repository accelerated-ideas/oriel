import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/config/brand";
import { authorizeAgent } from "@/lib/auth/access";
import { getUser } from "@/lib/auth/get-user";
import { verifyToken } from "@/lib/crypto";
import { addCapabilities } from "@/lib/integrations/actions";
import { isProviderId } from "@/lib/integrations/catalog";
import { adapterFor } from "@/lib/integrations/providers";
import { loadConnection, saveConnection } from "@/lib/integrations/store";

export const dynamic = "force-dynamic";

// The service sends the user back here after they approve (or decline) access.
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const query = request.nextUrl.searchParams;
  const claims = verifyToken<{ agentId: string; userId: string; provider: string; extra?: Record<string, string> }>(
    "integration-connect",
    query.get("state"),
  );
  if (!claims || !isProviderId(provider) || claims.provider !== provider) return NextResponse.redirect(new URL("/account", request.url));

  const user = await getUser();
  if (!user || user.id !== claims.userId) return NextResponse.redirect(new URL("/auth", request.url));
  const access = await authorizeAgent(claims.agentId);
  if (!access.ok) return NextResponse.redirect(new URL("/account", request.url));

  const back = new URL(`/account/${access.agent.organization_id}/agents/${claims.agentId}/integrations`, request.url);
  back.searchParams.set("integration", provider);
  const code = query.get("code");
  if (!code) {
    back.searchParams.set("result", query.get("error") === "access_denied" ? "cancelled" : "failed");
    return NextResponse.redirect(back);
  }

  try {
    const connected = await adapterFor(provider).exchangeCode!(
      code,
      appUrl(`/api/integrations/${provider}/callback`),
      claims.extra ?? {},
      query.get("state") ?? "",
      await loadConnection(claims.agentId, provider),
    );
    await saveConnection({ agentId: claims.agentId, organizationId: access.agent.organization_id, provider, ...connected });
    await addCapabilities(claims.agentId, access.agent.organization_id, provider);
    back.searchParams.set("result", "connected");
  } catch (error) {
    console.error(`Connecting ${provider} failed`, error);
    back.searchParams.set("result", "failed");
  }
  return NextResponse.redirect(back);
}
