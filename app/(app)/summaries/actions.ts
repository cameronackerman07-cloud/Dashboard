"use server";

import { revalidatePath } from "next/cache";
import { createNoteWith } from "@/app/(app)/notes/actions";
import { aiErrorMessage, fallbackNote } from "@/lib/ai";
import { ExtractError, extractText, MAX_UPLOAD_BYTES } from "@/lib/extract";
import { normKey } from "@/lib/flashcards";
import { cleanSubject, matchSubject } from "@/lib/subjects";
import { summariseText, type SummarySection } from "@/lib/summarise";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { isUuid, SAVE_FAILED, SIGNED_OUT, type Reply } from "@/lib/validate";

// RLS keeps every row scoped to the signed-in user.

const MAX_STORED_TEXT = 200_000;
const MAX_PASTE = 100_000;

export type UploadReply =
  | {
      ok: true;
      uploadId: string;
      title: string;
      subject: string;
      sections: SummarySection[];
      created: number;
      skipped: number;
      truncated: boolean;
      model: string;
      note?: string;
      cardsFailed: boolean;
    }
  | { ok: false; message: string };

// Upload (or pasted text) → text → AI summary + flashcards → saved.
export async function summariseUpload(form: FormData): Promise<UploadReply> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: SIGNED_OUT.message };

  const file = form.get("file");
  const pasted = String(form.get("text") ?? "");
  const pickedSubject = matchSubject(form.get("subject"));
  const model = String(form.get("model") ?? "") || undefined;

  let text: string;
  let filename: string | null = null;
  try {
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: "That file is over 4 MB. Split it into smaller files, or paste the text instead." };
      filename = file.name.slice(0, 200);
      text = await extractText(file);
    } else if (pasted.trim().length >= 40) {
      if (pasted.length > MAX_PASTE) return { ok: false, message: "That's a lot of text. Paste up to about 100,000 characters at a time." };
      text = pasted.trim();
    } else {
      return { ok: false, message: "Choose a file, or paste at least a few sentences." };
    }
  } catch (err) {
    return { ok: false, message: err instanceof ExtractError ? err.message : "Couldn't read that file." };
  }

  let summary;
  try {
    summary = await summariseText(text, { subject: pickedSubject, model, userId });
  } catch (err) {
    return { ok: false, message: aiErrorMessage(err) };
  }

  const supabase = await createClient();
  const subject = cleanSubject(summary.subject);
  const { data: upload, error } = await supabase
    .from("uploads")
    .insert({
      title: summary.title,
      filename,
      subject,
      summary: { sections: summary.sections, model: summary.result.modelLabel },
      extracted_text: text.slice(0, MAX_STORED_TEXT),
      truncated: summary.truncated,
    })
    .select("id")
    .single();
  if (error || !upload) return { ok: false, message: "The summary was made but couldn't be saved. Try again." };

  // Flashcards: skip any question you already have (in any subject).
  let created = 0;
  let skipped = 0;
  let cardsFailed = false;
  const drafts = summary.flashcards.map((c) => ({ ...c, key: normKey(c.front) })).filter((c) => c.key);
  if (drafts.length > 0) {
    // Looked up a few at a time so the request URL stays short.
    const have = new Set<string | null>();
    let lookupError = false;
    for (let i = 0; i < drafts.length; i += 15) {
      const { data: existing, error: e } = await supabase
        .from("flashcards")
        .select("norm_key")
        .in(
          "norm_key",
          drafts.slice(i, i + 15).map((d) => d.key),
        );
      if (e) lookupError = true;
      for (const r of (existing ?? []) as { norm_key: string | null }[]) have.add(r.norm_key);
    }
    if (lookupError) {
      cardsFailed = true;
    } else {
      const fresh = drafts.filter((d) => !have.has(d.key));
      skipped = drafts.length - fresh.length;
      if (fresh.length > 0) {
        const now = new Date().toISOString();
        const { error: insertError } = await supabase.from("flashcards").insert(
          fresh.map((d) => ({
            upload_id: upload.id,
            subject,
            module: d.module,
            topic: d.topic,
            front: d.front,
            back: d.back,
            norm_key: d.key,
            due_at: now,
          })),
        );
        if (insertError) cardsFailed = true;
        else created = fresh.length;
      }
    }
  }
  if (created > 0) await supabase.from("uploads").update({ card_count: created }).eq("id", upload.id);

  revalidatePath("/summaries");
  revalidatePath("/flashcards");
  return {
    ok: true,
    uploadId: upload.id as string,
    title: summary.title,
    subject,
    sections: summary.sections,
    created,
    skipped,
    truncated: summary.truncated,
    model: summary.result.modelLabel,
    note: fallbackNote(model, summary.result),
    cardsFailed,
  };
}

// Deleting a summary keeps its flashcards unless `withCards` is ticked.
export async function deleteUpload(id: string, withCards: boolean): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  if (withCards) {
    const { error } = await supabase.from("flashcards").delete().eq("upload_id", id);
    if (error) return SAVE_FAILED;
  }
  const { error } = await supabase.from("uploads").delete().eq("id", id);
  if (error) return SAVE_FAILED;
  revalidatePath("/summaries");
  revalidatePath("/flashcards");
  return { ok: true, message: withCards ? "Summary and its flashcards deleted." : "Summary deleted. Its flashcards are kept." };
}

export async function saveSummaryToNotes(uploadId: string): Promise<Reply> {
  if (!isUuid(uploadId)) return SAVE_FAILED;
  const supabase = await createClient();
  const { data } = await supabase.from("uploads").select("title, subject, summary").eq("id", uploadId).maybeSingle();
  if (!data) return SAVE_FAILED;
  const sections = ((data.summary as { sections?: SummarySection[] } | null)?.sections ?? []) as SummarySection[];
  const body = sections.map((s) => `${s.heading}\n${s.points.map((p) => `- ${p}`).join("\n")}`).join("\n\n");
  const id = await createNoteWith(data.title as string, body, (data.subject as string | null) ?? null);
  return id ? { ok: true, message: "Saved to Notes." } : SAVE_FAILED;
}
