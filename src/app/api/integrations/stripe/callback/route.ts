import Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeAgent } from "@/lib/auth/access";
import { getUser } from "@/lib/auth/get-user";
import { verifyToken } from "@/lib/crypto";
import { installStripeApp, isStripeAppMode, saveStripeConnection, stripeAccountName } from "@/lib/integrations/stripe";

export const dynamic = "force-dynamic";

// Stripe sends the user back here after they install the app (or decline).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const claims = verifyToken<{ agentId: string; userId: string; mode: string }>("stripe-connect", params.get("state"));
  // Installs started from Stripe's marketplace have no state: they start in the dashboard instead.
  if (!claims || !isStripeAppMode(claims.mode)) return NextResponse.redirect(new URL("/account", request.url));

  const user = await getUser();
  if (!user || user.id !== claims.userId) return NextResponse.redirect(new URL("/auth", request.url));
  const access = await authorizeAgent(claims.agentId);
  if (!access.ok) return NextResponse.redirect(new URL("/account", request.url));

  const back = new URL(`/account/${access.agent.organization_id}/agents/${claims.agentId}/integrations`, request.url);
  const code = params.get("code");
  if (!code) {
    back.searchParams.set("stripe", params.get("error") === "access_denied" ? "cancelled" : "failed");
    return NextResponse.redirect(back);
  }

  try {
    const installed = await installStripeApp(claims.mode, code);
    const accountName = await stripeAccountName(new Stripe(installed.accessToken, { timeout: 15_000 }));
    await saveStripeConnection({
      agentId: claims.agentId,
      organizationId: access.agent.organization_id,
      secret: installed.secret,
      metadata: {
        account_name: accountName,
        livemode: installed.livemode,
        account_id: installed.accountId,
        connected_via: "app",
        mode: claims.mode,
      },
    });
    back.searchParams.set("stripe", "connected");
  } catch (error) {
    console.error("Stripe connect failed", error);
    back.searchParams.set("stripe", "failed");
  }
  return NextResponse.redirect(back);
}
