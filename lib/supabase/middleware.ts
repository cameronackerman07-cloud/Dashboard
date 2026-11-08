import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from "./env";

// Pages anyone may see while signed out. Everything else requires a session.
// /privacy and /terms stay public so Google's OAuth consent screen can reach them.
// /api/auth is sign-in and sign-up; /api/cron checks its own secret.
const PUBLIC_PATHS = ["/login", "/auth", "/privacy", "/terms", "/offline", "/install", "/sw.js", "/api/auth", "/api/cron", "/api/agents/tick", "/api/shortcuts", "/api/calendar/feed"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Refreshes the Supabase session on every request and gates access:
// signed-out visitors are sent to /login; signed-in visitors never see /login.
export async function updateSession(request: NextRequest) {
  // Before Supabase is set up there's no one to sign in, so let pages load:
  // each one shows "Supabase isn't connected yet" instead.
  if (!supabaseConfigured()) return NextResponse.next({ request });

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
      },
    },
  });

  // IMPORTANT: do nothing between creating the client and getUser() — it keeps
  // the session fresh and avoids hard-to-debug sign-outs (per @supabase/ssr docs).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return copyCookies(supabaseResponse, NextResponse.redirect(url));
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return copyCookies(supabaseResponse, NextResponse.redirect(url));
  }

  return supabaseResponse;
}

// Carry any refreshed auth cookies onto a redirect so the session isn't lost.
function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}
