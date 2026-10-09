"use server";
import { z } from "zod";
import { authorizeAgent } from "@/lib/auth/access";
import { listConversations } from "@/lib/conversations/list";

const optionsSchema = z.object({
  query: z.string().max(200).optional(),
  before: z.string().max(64).optional(),
});

export async function actionListConversations(agentId: string, options: z.infer<typeof optionsSchema>) {
  const access = await authorizeAgent(agentId);
  if (!access.ok) return { ok: false as const, error: access.error };
  const parsed = optionsSchema.safeParse(options);
  if (!parsed.success) return { ok: false as const, error: "Invalid request" };
  return { ok: true as const, data: await listConversations(agentId, parsed.data) };
}
