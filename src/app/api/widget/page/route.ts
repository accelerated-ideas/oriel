import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { pageSchema, recordPage } from "@/lib/widget/page";
import { readWidgetSession } from "@/lib/widget/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ sessionToken: z.string(), page: pageSchema });

// The host page changed (SPA route change or a reload mid-conversation).
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const session = await readWidgetSession(parsed.data.sessionToken);
  if (!session) return NextResponse.json({ error: "Session expired" }, { status: 401 });

  if (parsed.data.page.url !== session.pageUrl) await recordPage(session, parsed.data.page);
  return NextResponse.json({ ok: true });
}
