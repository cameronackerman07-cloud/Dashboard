import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <main className="main main-narrow">
      <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: "var(--muted)" }}>
        <Link href="/" style={{ color: "var(--muted)" }}>
          Home
        </Link>{" "}
        / <span style={{ color: "var(--ink)", fontWeight: 600 }}>Terms of service</span>
      </nav>
      <h1 className="page-title">Terms of service</h1>
      <p className="lede">Last updated 27 October 2026</p>
      <section className="card">
        <p>
          Dashboard is a personal project used only by its owner. It is provided as-is, with no guarantees. AI
          answers and marking can be wrong — check important work against official NESA marking guidelines. See the{" "}
          <Link href="/privacy">privacy policy</Link> for how data is handled.
        </p>
      </section>
    </main>
  );
}
