"use client";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/types";

// Runs a server action and reports failures with a toast.
export async function runAction<T>(
  fn: () => Promise<ActionResult<T>>,
  options: { success?: string; onSuccess?: (result: ActionResult<T> & { ok: true }) => void } = {},
) {
  try {
    const result = await fn();
    if (!result.ok) {
      toast.error(result.error);
      return null;
    }
    if (options.success) toast.success(options.success);
    options.onSuccess?.(result);
    return result;
  } catch (error) {
    console.error(error);
    toast.error("Something went wrong. Try again.");
    return null;
  }
}
