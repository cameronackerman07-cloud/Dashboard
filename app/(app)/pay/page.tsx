import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import type { BudgetLimit, SavingsGoal, Transaction } from "@/lib/budget";
import { formatCents } from "@/lib/money";
import { shiftPayCents, shiftPayNote, type Job, type Shift } from "@/lib/shifts";
import { createClient } from "@/lib/supabase/server";
import {
  addDays,
  addMonths,
  dayKey,
  formatDayKey,
  formatMonth,
  isMonthKey,
  mondayOf,
  monthKey,
  monthRange,
  sydneyInstant,
} from "@/lib/time";
import { PayClient, type ShiftWeek } from "./PayClient";

export const metadata: Metadata = { title: "Pay & budget" };

type Props = { searchParams: Promise<{ m?: string }> };

export default async function PayPage({ searchParams }: Props) {
  const { m } = await searchParams;
  const now = Date.now();
  const today = dayKey(now);
  const month = isMonthKey(m) ? m : monthKey(now);
  const { start, end } = monthRange(month);
  // Whole weeks around the month, for the "log a week's shift pay" list.
  const firstMonday = mondayOf(start);
  const afterLastWeek = addDays(mondayOf(addDays(end, -1)), 7);

  const supabase = await createClient();
  const [{ data: tx }, { data: limits }, { data: goals }, { data: jobs }, { data: shifts }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, type, amount_cents, category, note, occurred_on")
      .gte("occurred_on", start)
      .lt("occurred_on", end)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("budget_limits").select("id, category, monthly_limit_cents").order("category", { ascending: true }),
    supabase.from("savings_goals").select("id, name, target_cents, saved_cents").order("created_at", { ascending: true }),
    supabase.from("jobs").select("id, name, default_rate_cents, kind"),
    supabase
      .from("shifts")
      .select("id, job_id, starts_at, ends_at, unpaid_break_minutes, rate_override_cents, notes")
      .gte("starts_at", new Date(sydneyInstant(firstMonday)).toISOString())
      .lt("starts_at", new Date(sydneyInstant(afterLastWeek)).toISOString()),
  ]);

  const transactions = (tx ?? []) as Transaction[];
  const jobById = new Map(((jobs ?? []) as Job[]).map((j) => [j.id, j]));
  const shiftList = (shifts ?? []) as Shift[];

  // Estimated shift pay for shifts that start inside this month.
  let shiftEstimate = 0;
  const weeks = new Map<string, number>();
  for (const s of shiftList) {
    const day = dayKey(new Date(s.starts_at).getTime());
    const pay = shiftPayCents(s, jobById.get(s.job_id));
    if (day >= start && day < end) shiftEstimate += pay;
    const monday = mondayOf(day);
    weeks.set(monday, (weeks.get(monday) ?? 0) + pay);
  }

  const notes = [...weeks.keys()].map(shiftPayNote);
  const { data: loggedRows } = notes.length
    ? await supabase.from("transactions").select("note").in("note", notes)
    : { data: [] as { note: string }[] };
  const logged = new Set((loggedRows ?? []).map((r: { note: string | null }) => r.note));

  const shiftWeeks: ShiftWeek[] = [...weeks.entries()]
    .filter(([, cents]) => cents > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monday, cents]) => ({
      monday,
      label: `${formatDayKey(monday)} – ${formatDayKey(addDays(monday, 6))}`,
      cents,
      logged: logged.has(shiftPayNote(monday)),
      future: monday > today,
    }));

  const income = transactions.filter((t) => t.type === "income").reduce((a, t) => a + t.amount_cents, 0);
  const spent = transactions.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount_cents, 0);

  return (
    <main className="main main-narrow">
      <PageHeader icon="pay" title="Pay & budget" lede="What came in, what went out, and what you're saving for." />

      <nav className="week-nav" aria-label="Choose a month">
        <Link className="btn" href={`/pay?m=${addMonths(month, -1)}`} aria-label="Previous month">
          ← Prev
        </Link>
        <div className="week-nav-label">
          <strong>{formatMonth(month)}</strong>
          {month !== monthKey(now) ? (
            <Link href="/pay" className="card-link">
              Back to this month
            </Link>
          ) : (
            <span className="card-meta">This month</span>
          )}
        </div>
        <Link className="btn" href={`/pay?m=${addMonths(month, 1)}`} aria-label="Next month">
          Next →
        </Link>
      </nav>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Income</span>
          <span className="stat-value">{formatCents(income)}</span>
          <span className="card-meta">Shifts estimate {formatCents(shiftEstimate)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Spent</span>
          <span className="stat-value">{formatCents(spent)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Left</span>
          <span className="stat-value">{formatCents(income - spent)}</span>
        </div>
      </div>

      <PayClient
        transactions={transactions}
        limits={(limits ?? []) as BudgetLimit[]}
        goals={(goals ?? []) as SavingsGoal[]}
        shiftWeeks={shiftWeeks}
        defaultDay={today >= start && today < end ? today : start}
      />
    </main>
  );
}
