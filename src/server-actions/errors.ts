"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";

const pageErrorSchema = z.object({
  message: z.string().max(2000),
  stack: z.string().max(4000).optional(),
  path: z.string().max(500),
});

// A page broke in someone's browser (error.tsx). Errors from the server are
// reported where they happen (src/instrumentation.ts). Anyone can call this,
// so it's limited per address, cut short, and gets no query string.
export async function actionReportPageError(input: z.input<typeof pageErrorSchema>) {
  const parsed = pageErrorSchema.safeParse(input);
  if (!parsed.success) return;
  const address = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await rateLimit(`page-error:${address}`, 5, "10 m"))) return;
  const { message, stack, path } = parsed.data;
  const frames = (stack ?? "").split("\n").slice(1, 4).map((line) => line.trim()).join("\n");
  await notify(`🖥️ Page error on ${path.split(/[?#]/)[0]}\n\n${message.slice(0, 500)}${frames ? `\n${frames}` : ""}`);
}
