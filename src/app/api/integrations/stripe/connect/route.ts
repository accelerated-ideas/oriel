import { NextResponse, type NextRequest } from "next/server";
import { authorizeAgent } from "@/lib/auth/access";
import { getUser } from "@/lib/auth/get-user";
import { signToken } from "@/lib/crypto";
import { isStripeAppMode, stripeAppModes, stripeInstallUrl } from "@/lib/integrations/stripe";

export const dynamic = "force-dynamic";

// Sends a workspace member to Stripe to install our app for one assistant, in
// their live account or a sandbox (`mode`).
export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId") ?? "";
  const mode = request.nextUrl.searchParams.get("mode") ?? "live";
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/auth", request.url));
  const access = await authorizeAgent(agentId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: 403 });
  if (!isStripeAppMode(mode) || !stripeAppModes().includes(mode)) {
    return NextResponse.json({ error: "Connect with Stripe isn't set up on this server." }, { status: 503 });
  }
  const state = signToken("stripe-connect", { agentId, userId: user.id, mode }, 15 * 60);
  return NextResponse.redirect(stripeInstallUrl(mode, state));
}
