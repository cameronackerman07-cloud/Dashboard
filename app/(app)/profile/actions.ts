"use server";

import { revalidatePath } from "next/cache";
import { cleanFact, questionnaireFacts, QUESTIONS, type Questionnaire } from "@/lib/about-me";
import { analyseProfile } from "@/lib/about-me-server";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { isUuid, SAVE_FAILED, SIGNED_OUT, text, type Reply } from "@/lib/validate";

// RLS keeps every fact, sample and switch private to the signed-in user.

const NOT_READY: Reply = { ok: false, message: "About me isn't set up yet. Run supabase/agents.sql in Supabase first." };
const SENSITIVE: Reply = { ok: false, message: "That looks like a sensitive topic (health, beliefs, family, etc.), so it isn't saved here." };
const refresh = () => revalidatePath("/profile");
const SWITCHES = ["use_behaviour", "use_samples", "include_notes", "use_style", "ai_pass"] as const;

export async function saveSwitches(form: FormData): Promise<Reply> {
  if (!(await currentUserId())) return SIGNED_OUT;
  const supabase = await createClient();
  const row = Object.fromEntries(SWITCHES.map((k) => [k, form.get(k) === "on"]));
  const { error } = await supabase.from("profile_settings").upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return error.code === "42P01" ? NOT_READY : SAVE_FAILED;
  refresh();
  return { ok: true, message: "Saved. Only the switches that are on are used." };
}

export async function saveQuestionnaire(form: FormData): Promise<Reply> {
  if (!(await currentUserId())) return SIGNED_OUT;
  const q = Object.fromEntries(QUESTIONS.map((x) => [x.key, text(form.get(x.key), 200)])) as Questionnaire;
  const supabase = await createClient();
  const { error } = await supabase.from("profile_settings").upsert({ questionnaire: q, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return error.code === "42P01" ? NOT_READY : SAVE_FAILED;
  // Your answers replace your previous answers' facts; they're confirmed because you wrote them.
  await supabase.from("profile_facts").delete().eq("origin", "questionnaire");
  const facts = questionnaireFacts(q);
  if (facts.length) {
    const { error: e } = await supabase
      .from("profile_facts")
      .upsert(facts.map((f) => ({ category: f.category, text: f.text, source: "user", origin: "questionnaire", confidence: 1, status: "confirmed" })), { onConflict: "user_id,category,text" });
    if (e) return SAVE_FAILED;
  }
  refresh();
  const skipped = QUESTIONS.filter((x) => q[x.key]).length - facts.length;
  return { ok: true, message: skipped > 0 ? `Saved. ${skipped} answer${skipped === 1 ? " was" : "s were"} left out because ${skipped === 1 ? "it looked" : "they looked"} sensitive.` : "Saved." };
}

export async function addFact(form: FormData): Promise<Reply> {
  const raw = text(form.get("text"), 300);
  const f = cleanFact(form.get("category"), raw);
  if (!raw) return { ok: false, message: "Write the fact first." };
  if (!f) return SENSITIVE;
  if (!(await currentUserId())) return SIGNED_OUT;
  const supabase = await createClient();
  const { error } = await supabase.from("profile_facts").upsert({ ...f, source: "user", origin: "manual", confidence: 1, status: "confirmed" }, { onConflict: "user_id,category,text" });
  if (error) return error.code === "42P01" ? NOT_READY : SAVE_FAILED;
  refresh();
  return { ok: true, message: "Added." };
}

export async function setFactStatus(id: string, status: "confirmed" | "rejected"): Promise<Reply> {
  if (!isUuid(id) || !["confirmed", "rejected"].includes(status)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("profile_facts").update({ status }).eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: status === "confirmed" ? "Confirmed." : "Rejected — it won't be suggested again." };
}

export async function editFact(id: string, form: FormData): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { data } = await supabase.from("profile_facts").select("category").eq("id", id).maybeSingle();
  const f = cleanFact(data?.category, form.get("text"));
  if (!f) return SENSITIVE;
  const { error } = await supabase.from("profile_facts").update({ text: f.text, status: "confirmed" }).eq("id", id);
  if (error) return error.code === "23505" ? { ok: false, message: "You already have that fact." } : SAVE_FAILED;
  refresh();
  return { ok: true, message: "Saved and confirmed." };
}

export async function deleteFact(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("profile_facts").delete().eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Deleted." };
}

export async function addSample(form: FormData): Promise<Reply> {
  const title = text(form.get("title"), 120);
  const body = String(form.get("text") ?? "").trim().slice(0, 20000);
  if (!title || body.length < 20) return { ok: false, message: "Give it a title and paste at least a few sentences." };
  if (!(await currentUserId())) return SIGNED_OUT;
  const supabase = await createClient();
  const { error } = await supabase.from("writing_samples").insert({ title, text: body, include_in_ai: form.get("include_in_ai") === "on" });
  if (error) return error.code === "42P01" ? NOT_READY : SAVE_FAILED;
  refresh();
  return { ok: true, message: "Sample saved." };
}

export async function setSampleAi(id: string, include: boolean): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("writing_samples").update({ include_in_ai: include }).eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: include ? "This sample can go to your AI (if the AI pass is on)." : "This sample stays out of the AI." };
}

export async function deleteSample(id: string): Promise<Reply> {
  if (!isUuid(id)) return SAVE_FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("writing_samples").delete().eq("id", id);
  if (error) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Sample deleted." };
}

export async function analyseNow(): Promise<Reply> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const supabase = await createClient();
  const { added, ready } = await analyseProfile(supabase, userId);
  if (!ready) return NOT_READY;
  refresh();
  return { ok: true, message: added ? `${added} new suggestion${added === 1 ? "" : "s"} to review.` : "Nothing new. Switch on more sources above if you'd like more suggestions." };
}

export async function forgetEverything(): Promise<Reply> {
  if (!(await currentUserId())) return SIGNED_OUT;
  const supabase = await createClient();
  const results = await Promise.all([
    supabase.from("profile_facts").delete().not("id", "is", null),
    supabase.from("writing_samples").delete().not("id", "is", null),
    supabase.from("profile_settings").delete().not("user_id", "is", null),
  ]);
  if (results.some((r) => r.error)) return SAVE_FAILED;
  refresh();
  return { ok: true, message: "Everything in About me has been deleted." };
}
