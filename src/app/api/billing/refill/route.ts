import { NextResponse, type NextRequest } from "next/server";
import { refillMonthlyCredits } from "@/lib/billing/credits";
import { billingConfigured } from "@/lib/billing/stripe-billing";
import { workerSecret } from "@/lib/knowledge/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron, hourly (vercel.json): starts each new month of messages for
// yearly plans and plans set without Stripe (src/lib/billing/credits.ts).
// Authorized with CRON_SECRET, like the knowledge worker's cron.
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${workerSecret()}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!billingConfigured()) return NextResponse.json({ refilled: 0 });
  return NextResponse.json({ refilled: await refillMonthlyCredits() });
}
