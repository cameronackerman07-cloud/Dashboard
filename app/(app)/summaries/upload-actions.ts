"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { NO_KEY_MESSAGE } from "@/lib/ai";
import { budgetLeft, hasUsableKey } from "@/lib/ai-keys";
import { matchSubject } from "@/lib/subjects";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { MAX_DIRECT_UPLOAD_BYTES, safeFileName, uploadKind } from "@/lib/upload-files";
import { addDeckCards, prepareUpload, startJob, UploadError, type Estimate } from "@/lib/upload-jobs";
import { isUuid, SAVE_FAILED, SIGNED_OUT, type Reply } from "@/lib/validate";

// Uploads go from the browser straight to Supabase Storage (private bucket
// "uploads", under the user's own folder), so big files never pass through
// Vercel. The server only hands out a one-time signed upload address.

export type UploadTicket = { ok: true; uploadId: string; signedUrl: string } | { ok: false; message: string };

export async function requestUpload(p: { name: string; size: number; subject?: string; keepOriginal?: boolean }): Promise<UploadTicket> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: SIGNED_OUT.message };
  if (!adminConfigured()) return { ok: false, message: "Uploads need SUPABASE_SERVICE_ROLE_KEY in Vercel." };
  const name = String(p?.name ?? "").slice(0, 200);
  const size = Number(p?.size);
  const k = uploadKind(name);
  if ("error" in k) return { ok: false, message: k.error };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, message: "That file is empty." };
  if (size > MAX_DIRECT_UPLOAD_BYTES) return { ok: false, message: "That file is over 25 MB. Split it into smaller files, or save the deck without videos." };

  const id = randomUUID();
  const path = `${userId}/${id}/${safeFileName(name)}`;
  const db = await createClient();
  const { error } = await db.from("uploads").insert({
    id,
    title: name.replace(/\.[^.]+$/, "").slice(0, 120) || "Upload",
    filename: name,
    subject: matchSubject(p.subject),
    kind: k.kind,
    status: "uploading",
    storage_path: path,
    keep_original: !!p.keepOriginal,
    size_bytes: Math.round(size),
  });
  if (error) return { ok: false, message: "Couldn't start the upload. Has supabase/phase6.sql been run?" };
  const { data, error: e2 } = await createAdminClient().storage.from("uploads").createSignedUploadUrl(path);
  if (e2 || !data) {
    await db.from("uploads").delete().eq("id", id);
    return { ok: false, message: "Couldn't get an upload address. Check the uploads bucket exists in Supabase Storage." };
  }
  return { ok: true, uploadId: id, signedUrl: data.signedUrl };
}

export type PrepareReply = { ok: true; message: string; estimate: Estimate; budget: number; hasKey: boolean } | { ok: false; message: string };

export async function prepareUploaded(uploadId: string): Promise<PrepareReply> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: SIGNED_OUT.message };
  if (!isUuid(uploadId)) return { ok: false, message: SAVE_FAILED.message };
  try {
    const estimate = await prepareUpload(createAdminClient(), userId, uploadId);
    const [budget, hasKey] = await Promise.all([budgetLeft(userId), hasUsableKey(userId)]);
    revalidatePath("/summaries");
    return { ok: true, message: "", estimate, budget, hasKey };
  } catch (err) {
    return { ok: false, message: err instanceof UploadError ? err.message : "Couldn't read that file." };
  }
}

export async function startSummary(uploadId: string, quick: boolean): Promise<Reply & { total?: number }> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  if (!isUuid(uploadId)) return SAVE_FAILED;
  if (!(await hasUsableKey(userId))) return { ok: false, message: NO_KEY_MESSAGE };
  try {
    const { total } = await startJob(createAdminClient(), userId, uploadId, !!quick);
    return { ok: true, message: "", total };
  } catch (err) {
    return { ok: false, message: err instanceof UploadError ? err.message : "Couldn't start." };
  }
}

export async function addKeptCards(uploadId: string, keep: number[]): Promise<Reply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  if (!isUuid(uploadId) || !Array.isArray(keep)) return SAVE_FAILED;
  try {
    const { created, skipped } = await addDeckCards(createAdminClient(), userId, uploadId, keep.slice(0, 500).map(Number));
    revalidatePath("/flashcards");
    revalidatePath(`/summaries/${uploadId}`);
    if (!created && !skipped) return { ok: false, message: "Tick at least one card." };
    return { ok: true, message: `Added ${created} card${created === 1 ? "" : "s"} to Flashcards${skipped ? ` (${skipped} skipped: you already have them)` : ""}.` };
  } catch (err) {
    return { ok: false, message: err instanceof UploadError ? err.message : "Couldn't save the cards." };
  }
}
