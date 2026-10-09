"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeOrg } from "@/lib/auth/access";
import { getWorkspaceBilling } from "@/lib/billing/limits";
import {
  billingConfigured,
  changePlan,
  createCheckoutUrl,
  createPortalUrl,
  hasLiveSubscription,
  PaymentFailedError,
  previewPlanChange,
  stripePriceId,
  type PlanChangePreview,
  type PlanChangeResult,
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

// What choosing a plan would do for a workspace that already pays: charge
// the difference now, or switch at the next billing date.
export async function actionPreviewPlanChange(input: z.input<typeof choosePlanSchema>): Promise<ActionResult<{ preview: PlanChangePreview }>> {
  try {
    const data = choosePlanSchema.parse(input);
    const access = await billingAccess(data.organizationId);
    if (!access.ok) return access;
    if (!hasLiveSubscription(access.workspace)) return { ok: false, error: "This workspace has no plan to change." };
    return { ok: true, data: { preview: await previewPlanChange(access.workspace, data) } };
  } catch (error) {
    console.error("actionPreviewPlanChange", error);
    return { ok: false, error: error instanceof z.ZodError ? error.issues[0].message : "Couldn't reach Stripe. Try again." };
  }
}

// Starts Checkout, or changes an existing subscription. Returns a URL to go
// to, or what the change did.
export async function actionChoosePlan(
  input: z.input<typeof choosePlanSchema>,
): Promise<ActionResult<{ url: string } | { url: null; change: PlanChangeResult }>> {
  try {
    const data = choosePlanSchema.parse(input);
    const access = await billingAccess(data.organizationId);
    if (!access.ok) return access;
    const priceId = stripePriceId(data.planId, data.period);
    if (!priceId) return { ok: false, error: "This plan isn't set up in Stripe yet." };

    if (hasLiveSubscription(access.workspace)) {
      const change = await changePlan(access.workspace, data);
      revalidatePath(`/account/${data.organizationId}`, "layout");
      return { ok: true, data: { url: null, change } };
    }
    return { ok: true, data: { url: await createCheckoutUrl(access.workspace, priceId, access.user.email ?? "") } };
  } catch (error) {
    if (error instanceof PaymentFailedError) {
      return { ok: false, error: `${error.message} Your plan didn't change. Update your card under Invoices and payment, then try again.` };
    }
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
