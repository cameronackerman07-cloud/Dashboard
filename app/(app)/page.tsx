import Link from "next/link";
import { Greeting } from "@/components/Greeting";
import { Icon } from "@/components/Icon";
import { TaskList } from "@/components/TaskList";
import { SAMPLE_HABITS, SAMPLE_PERIODS, SAMPLE_TASKS } from "@/lib/sample";

export default function Home() {
  return (
    <main className="main">
      <div className="page-head">
        <Greeting name="Cameron" />
        <button type="button" className="icon-btn desktop-only" aria-label="Notifications">
          <Icon name="bell" />
        </button>
      </div>

      <div className="notice" role="note">
        <span>Showing sample data. Connect Canvas, Google and your other apps to fill this in.</span>
        <Link href="/settings" className="card-link">
          Open connections →
        </Link>
      </div>

      <form className="ask" action="/tutor">
        <label>
          <Icon name="sparkle" />
          <span className="sr-only">Ask AI or search</span>
          <input name="q" type="text" placeholder="Ask the AI, search notes, or type a topic to practise…" />
        </label>
        <span className="ask-meta">Free models · auto</span>
        <button type="submit" className="btn btn-dark" style={{ minHeight: 40 }}>
          Ask
        </button>
      </form>

      <section className="card briefing" aria-label="Morning briefing">
        <div className="briefing-body">
          <div className="briefing-label">
            <Icon name="sparkle" size={16} />
            Your briefing
          </div>
          <p className="briefing-text">
            Physics is your next class. Your Maths Advanced practice set is due Thursday, and you have a shift
            tonight — so the planner has moved 30 minutes of Extension 1 flashcards to before dinner.
          </p>
          <span className="card-meta">Example — the AI agent writes this each morning and sends it to your iPhone.</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Link href="/planner" className="btn">
            See study plan
          </Link>
        </div>
      </section>

      <div className="grid">
        <section className="card" aria-label="Today's timetable">
          <div className="card-head">
            <h2 className="card-title">Today</h2>
            <span className="card-meta">Atlantis Timetable</span>
          </div>
          <div className="rows">
            {SAMPLE_PERIODS.map((p) => (
              <div className="row" key={p.slot}>
                <span className="row-slot">{p.slot}</span>
                <span className="row-main">{p.name}</span>
                {p.next ? <span className="chip">NEXT</span> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="card" aria-label="Due soon">
          <div className="card-head">
            <h2 className="card-title">Due soon</h2>
            <Link href="/assignments" className="card-link">
              All tasks
            </Link>
          </div>
          <TaskList tasks={SAMPLE_TASKS} />
        </section>

        <section className="card" aria-label="Countdowns">
          <h2 className="card-title">Countdowns</h2>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span className="big-number">2</span>
            <span style={{ fontSize: 14, fontWeight: 500 }}>days · Maths Adv practice set</span>
          </div>
          <div className="rows" style={{ borderTop: "1px solid var(--line-soft)" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>Engineering report</span>
              <strong>3 days</strong>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>Term 4 ends</span>
              <strong>— days</strong>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>HSC exams</span>
              <strong>— days</strong>
            </div>
          </div>
        </section>

        <section className="card" aria-label="Quick actions">
          <h2 className="card-title">Quick actions</h2>
          <div className="actions">
            <Link href="/hsc-practice" className="action">
              <Icon name="hsc" size={18} />
              HSC question
            </Link>
            <Link href="/summaries" className="action">
              <Icon name="summaries" size={18} />
              Upload notes
            </Link>
            <Link href="/planner" className="action">
              <Icon name="timetable" size={18} />
              25-min focus
            </Link>
            <Link href="/tutor" className="action">
              <Icon name="tutor" size={18} />
              Ask the tutor
            </Link>
          </div>
        </section>

        <section className="card" aria-label="Habits">
          <div className="card-head">
            <h2 className="card-title">Habits this week</h2>
            <span className="card-meta">M T W T F S S</span>
          </div>
          {SAMPLE_HABITS.map((h) => (
            <div key={h.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 32 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{h.name}</span>
              <span className="dots" aria-label={`${h.done} of 7 days done`}>
                {Array.from({ length: 7 }, (_, i) => (
                  <span key={i} className={`dot${i < h.done ? " on" : ""}`} />
                ))}
              </span>
            </div>
          ))}
        </section>

        <section className="card" aria-label="Next shift">
          <h2 className="card-title">Next shift</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 700 }}>Not connected yet</span>
            <span className="card-meta">Add your roster in Shifts to see your next shift and pay.</span>
          </div>
          <Link href="/shifts" className="card-link">
            Set up shifts →
          </Link>
        </section>

        <section className="card tile-row" aria-label="Weather">
          <Icon name="sun" size={44} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>Weather</span>
            <span className="card-meta">Switches on with your suburb in Settings</span>
          </div>
        </section>

        <section className="card tile-row" aria-label="Spotify">
          <span className="album">
            <Icon name="music" size={22} />
          </span>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Nothing playing</span>
            <span className="card-meta">Spotify · connect in Settings</span>
          </div>
          <button type="button" className="icon-btn" aria-label="Play" style={{ borderRadius: 22 }}>
            <Icon name="play" size={18} />
          </button>
        </section>
      </div>
    </main>
  );
}
