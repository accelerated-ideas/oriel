import { NextResponse, type NextRequest } from "next/server";
import { IS_CLOUD } from "@/config/edition";
import { updateSession } from "@/lib/supabase/proxy-session";

const originCache = new Map<string, { origins: string[] | null; at: number }>();
const CACHE_MS = 60_000;

async function allowedOrigins(agentId: string) {
  const cached = originCache.get(agentId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.origins;

  let origins: string[] | null = null;
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/agents?id=eq.${encodeURIComponent(agentId)}&select=allowed_origins`;
    const key = process.env.SUPABASE_SERVICE_KEY ?? "";
    const response = await fetch(url, { headers: { apikey: key, authorization: `Bearer ${key}` }, cache: "no-store" });
    if (response.ok) {
      const rows = (await response.json()) as { allowed_origins: string[] }[];
      origins = rows[0]?.allowed_origins ?? null;
    }
  } catch {
    origins = null;
  }
  originCache.set(agentId, { origins, at: Date.now() });
  if (originCache.size > 5000) originCache.clear();
  return origins;
}

function sanitizeSource(origin: string) {
  return /^https?:\/\/(\*\.)?[a-z0-9.-]+(:\d+)?$/i.test(origin) ? origin : null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Self-hosted installs have no marketing site: the root is the dashboard.
  if (!IS_CLOUD && pathname === "/") return NextResponse.redirect(new URL("/account", request.url));

  // The widget is embedded in customer sites: only allowed origins may frame it.
  const widgetMatch = pathname.match(/^\/widget\/([0-9a-f-]{36})\/?$/i);
  if (widgetMatch) {
    const origins = await allowedOrigins(widgetMatch[1]);
    const appOrigin = request.nextUrl.origin;
    const sources =
      origins && origins.length > 0
        ? ["'self'", appOrigin, ...origins.map(sanitizeSource).filter((value): value is string => Boolean(value))].join(" ")
        : "*";
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", `frame-ancestors ${sources}`);
    return response;
  }

  return updateSession(request);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|embed.js|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
