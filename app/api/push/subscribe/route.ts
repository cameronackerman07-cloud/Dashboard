import { NextResponse } from "next/server";
import { createClient, currentUserId } from "@/lib/supabase/server";

// Saves (POST) or removes (DELETE) this device's push subscription for the
// signed-in user. RLS also limits rows to their owner.
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });
  let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; label?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const label = typeof body.label === "string" ? body.label.slice(0, 60) : null;
  const supabase = await createClient();
  // Same device signing in as someone else: drop the old row first.
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({ endpoint, p256dh, auth, device_label: label });
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });
  const { endpoint, id } = (await request.json().catch(() => ({}))) as { endpoint?: string; id?: string };
  const supabase = await createClient();
  if (id) await supabase.from("push_subscriptions").delete().eq("id", id);
  else if (endpoint) await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
