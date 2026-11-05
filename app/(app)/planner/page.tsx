import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { COURSES } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { PlannerClient, type Block } from "./PlannerClient";

export const metadata: Metadata = { title: "Study planner" };

export default async function PlannerPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("study_blocks")
    .select("id, day_of_week, start_min, duration_min, subject, label")
    .order("day_of_week", { ascending: true })
    .order("start_min", { ascending: true });

  const blocks: Block[] = data ?? [];

  return (
    <main className="main">
      <PageHeader
        icon="planner"
        title="Study planner"
        lede="Block out when you'll study each week. Build it around your classes and shifts — later this can fill itself in automatically."
      />
      <PlannerClient blocks={blocks} courses={COURSES} />
    </main>
  );
}
