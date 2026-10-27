import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 "proxy" (formerly "middleware"): runs before every matched request.
// We use it to keep the Supabase auth session fresh and gate signed-out visitors.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run on every path except Next internals and static asset files, so auth
  // cookies stay fresh and every real page is gated.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
