import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy" };

// Needed for Google's OAuth consent screen. Keep it accurate as features are added.
export default function PrivacyPage() {
  return (
    <main className="main main-narrow">
      <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: "var(--muted)" }}>
        <Link href="/" style={{ color: "var(--muted)" }}>
          Home
        </Link>{" "}
        / <span style={{ color: "var(--ink)", fontWeight: 600 }}>Privacy policy</span>
      </nav>
      <h1 className="page-title">Privacy policy</h1>
      <p className="lede">Last updated 27 October 2026</p>

      <section className="card">
        <h2 className="card-title">Who this app is for</h2>
        <p>
          Dashboard is a personal school and life dashboard built and used by one person, its owner. It is not
          offered to the public.
        </p>
      </section>

      <section className="card">
        <h2 className="card-title">What it reads</h2>
        <p>
          When the owner connects a Google account, Dashboard asks for read-only access to Google Calendar, Google
          Classroom (courses and the owner&apos;s own coursework) and Google Drive. It uses this only to show the
          owner&apos;s own events, assignments and files inside the dashboard. It also reads calendar links and
          tokens the owner adds for school apps such as Canvas, Compass and Atlantis Timetable.
        </p>
      </section>

      <section className="card">
        <h2 className="card-title">How data is stored</h2>
        <p>
          Data is stored in the owner&apos;s private Supabase database. Access tokens are encrypted and only used on
          the server. Nothing is sold, shared with advertisers or given to anyone else.
        </p>
      </section>

      <section className="card">
        <h2 className="card-title">AI features</h2>
        <p>
          Some features send school content (for example a question or a page of notes) to AI model providers to
          generate answers. Names, emails, tokens and other personal details are not sent.
        </p>
      </section>

      <section className="card">
        <h2 className="card-title">Removing access</h2>
        <p>
          The owner can disconnect any account in Settings, or remove access at any time from their Google Account
          under Security → Third-party apps &amp; services. Disconnecting deletes the stored tokens.
        </p>
      </section>

      <section className="card">
        <h2 className="card-title">Contact</h2>
        <p>cameronackerman07@gmail.com</p>
      </section>
    </main>
  );
}
