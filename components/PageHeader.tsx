import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";

// Shared page header: breadcrumb back to Home, icon, title and one-line lede.
// Used by every built-out section page so they all read the same.
export function PageHeader({
  icon,
  title,
  lede,
}: {
  icon: IconName;
  title: string;
  lede: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: "var(--muted)" }}>
        <Link href="/" style={{ color: "var(--muted)" }}>
          Home
        </Link>{" "}
        / <span style={{ color: "var(--ink)", fontWeight: 600 }}>{title}</span>
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span className="connect-logo">
          <Icon name={icon} size={22} />
        </span>
        <h1 className="page-title">{title}</h1>
      </div>
      <p className="lede">{lede}</p>
    </div>
  );
}
