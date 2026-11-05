import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { COURSES } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { TimetableClient, type ClassRow } from "./TimetableClient";

export const metadata: Metadata = { title: "Timetable" };

export default async function TimetablePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("timetable")
    .select("id, day_of_week, period, subject, room, week")
    .order("day_of_week", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const classes: ClassRow[] = data ?? [];

  return (
    <main className="main">
      <PageHeader
        icon="timetable"
        title="Timetable"
        lede="Your weekly classes. Add them here for now — a later update can pull them straight from Atlantis Timetable."
      />
      <TimetableClient classes={classes} courses={COURSES} />
    </main>
  );
}
