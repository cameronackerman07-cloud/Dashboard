import { NextResponse } from "next/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { currentUserId } from "@/lib/supabase/server";
import { runStep } from "@/lib/upload-jobs";
import { isUuid } from "@/lib/validate";

// One chunk of a big upload per request (one AI call, well under the time
// limit). The Summaries page calls this in a loop and shows the progress.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ status: "failed", error: "Signed out." }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id) || !adminConfigured()) return NextResponse.json({ status: "failed", error: "Not found." }, { status: 404 });
  const res = await runStep(createAdminClient(), userId, id);
  return NextResponse.json(res);
}
