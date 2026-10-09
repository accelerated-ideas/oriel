"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeOrg } from "@/lib/auth/access";
import { getWorkspaceBilling } from "@/lib/billing/limits";
import {
  billingConfigured,
  createCheckoutUrl,
  createPortalUrl,
  hasLiveSubscription,
  stripePriceId,
  switchSubscription,
} from "@/lib/billing/stripe-billing";
import type { ActionResult } from "@/lib/types";

const choosePlanSchema = z.object({
  organizationId: z.string().uuid(),
  planId: z.string().min(1).max(40),
  period: z.enum(["monthly", "annual"]),
});

async function billingAccess(organizationId: string) {
  if (!billingConfigured()) return { ok: false as const, error: "Billing isn't set up on this server." };
  const access = await authorizeOrg(organizationId);
  if (!access.ok) return access;
  if (access.role === "member") return { ok: false as const, error: "Only owners and admins can change billing." };
  const workspace = await getWorkspaceBilling(organizationId);
  if (!workspace) return { ok: false as const, error: "This workspace no longer exists." };
  return { ...access, workspace };
}

// Starts Checkout, or switches an existing subscription in place.
// Returns a URL to go to, or null when the switch already happened.
export async function actionChoosePlan(input: z.input<typeof choosePlanSchema>): Promise<ActionResult<{ url: string | null }>> {
  try {
    const data = choosePlanSchema.parse(input);
    const access = await billingAccess(data.organizationId);
    if (!access.ok) return access;
    const priceId = stripePriceId(data.planId, data.period);
    if (!priceId) return { ok: false, error: "This plan isn't set up in Stripe yet." };

    if (hasLiveSubscription(access.workspace)) {
      await switchSubscription(access.workspace, priceId);
      revalidatePath(`/account/${data.organizationId}/billing`);
      return { ok: true, data: { url: null } };
    }
    return { ok: true, data: { url: await createCheckoutUrl(access.workspace, priceId, access.user.email ?? "") } };
  } catch (error) {
    console.error("actionChoosePlan", error);
    return { ok: false, error: error instanceof z.ZodError ? error.issues[0].message : "Couldn't reach Stripe. Try again." };
  }
}

export async function actionOpenBillingPortal(input: { organizationId: string }): Promise<ActionResult<{ url: string }>> {
  try {
    const access = await billingAccess(z.string().uuid().parse(input.organizationId));
    if (!access.ok) return access;
    return { ok: true, data: { url: await createPortalUrl(access.workspace, access.user.email ?? "") } };
  } catch (error) {
    console.error("actionOpenBillingPortal", error);
    return { ok: false, error: "Couldn't open Stripe. Try again." };
  }
}
