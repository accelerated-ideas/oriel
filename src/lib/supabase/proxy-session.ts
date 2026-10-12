import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the auth session cookies and protects /account routes.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  try {
    // Refreshes an expired session and checks its signature locally (the
    // project signs with asymmetric keys), with no call to the auth server.
    // Pages still ask the server who the user is (src/lib/auth/get-user.ts).
    const { data } = await supabase.auth.getClaims();

    if (!data?.claims && request.nextUrl.pathname.startsWith("/account")) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth";
      url.search = "";
      return NextResponse.redirect(url);
    }
  } catch {
    // Treat auth failures as signed-out; route guards handle the rest.
  }

  return response;
}
