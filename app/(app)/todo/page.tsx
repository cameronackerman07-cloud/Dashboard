import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { dayKey } from "@/lib/time";
import { TodoClient, type Todo } from "./TodoClient";

export const metadata: Metadata = { title: "To-do" };

export default async function TodoPage() {
  const supabase = await createClient();
  const [{ data: open }, { data: done }] = await Promise.all([
    supabase
      .from("todos")
      .select("id, title, due_on, subject, priority, done, done_at")
      .eq("done", false)
      .order("due_on", { ascending: true, nullsFirst: false })
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(500),
    supabase
      .from("todos")
      .select("id, title, due_on, subject, priority, done, done_at")
      .eq("done", true)
      .order("done_at", { ascending: false })
      .limit(30),
  ]);

  return (
    <main className="main main-narrow">
      <PageHeader icon="todo" title="To-do" lede="Personal tasks. School work from Canvas lives in Assignments." />
      <TodoClient todos={[...((open ?? []) as Todo[]), ...((done ?? []) as Todo[])]} today={dayKey(Date.now())} />
    </main>
  );
}
