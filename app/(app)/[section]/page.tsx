import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { ALL_ITEMS } from "@/lib/nav";

// One page per sidebar item. Each shows what it will do and which build phase switches it on.
// As features get built, give a section its own folder (e.g. app/assignments/page.tsx) and it takes over.

export const dynamicParams = false;

export function generateStaticParams() {
  return ALL_ITEMS.filter((i) => i.slug).map((i) => ({ section: i.slug }));
}

type Props = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  const item = ALL_ITEMS.find((i) => i.slug === section);
  return { title: item?.label ?? "Not found" };
}

export default async function SectionPage({ params }: Props) {
  const { section } = await params;
  const item = ALL_ITEMS.find((i) => i.slug === section);
  if (!item) notFound();

  return (
    <main className="main main-narrow">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: "var(--muted)" }}>
          <Link href="/" style={{ color: "var(--muted)" }}>
            Home
          </Link>{" "}
          / <span style={{ color: "var(--ink)", fontWeight: 600 }}>{item.label}</span>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="connect-logo">
            <Icon name={item.icon} size={22} />
          </span>
          <h1 className="page-title">{item.label}</h1>
        </div>
        <p className="lede">{item.blurb}</p>
      </div>

      <section className="card" aria-label="What this page will do">
        <div className="card-head">
          <h2 className="card-title">What this page will do</h2>
          <span className="chip-outline">Phase {item.phase}</span>
        </div>
        <ul className="plan-list">
          {item.plans.map((p) => (
            <li key={p}>
              <Icon name="arrow" size={18} />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
