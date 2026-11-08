import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import type { Habit } from "@/lib/habits";
import { createClient } from "@/lib/supabase/server";
import { dayKey } from "@/lib/time";
import { HabitsClient } from "./HabitsClient";

export const metadata: Metadata = { title: "Habits" };

export default async function HabitsPage() {
  const supabase = await createClient();
  const [{ data: habits }, { data: logs }] = await Promise.all([
    supabase.from("habits").select("id, name, archived").order("created_at", { ascending: true }),
    supabase.from("habit_logs").select("habit_id, day").order("day", { ascending: false }).limit(10000),
  ]);

  return (
    <main className="main main-narrow">
      <PageHeader icon="habits" title="Habits" lede="Tick off today's habits and keep your streaks going." />
      <HabitsClient
        habits={(habits ?? []) as Habit[]}
        logs={((logs ?? []) as { habit_id: string; day: string }[]).map((l) => `${l.habit_id}|${l.day}`)}
        today={dayKey(Date.now())}
      />
    </main>
  );
}
