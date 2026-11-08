"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { NAV, type NavItem } from "@/lib/nav";
import { isInstalled } from "@/app/install/InstallSteps";

const STORAGE_KEY = "sidebar-collapsed";

function hrefFor(item: NavItem) {
  return item.slug ? `/${item.slug}` : "/";
}

export function Sidebar({
  badges = {},
  displayName,
  initials,
  userEmail = "",
}: {
  badges?: Record<string, number>;
  displayName: string;
  initials: string;
  userEmail?: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [installed, setInstalled] = useState(true);

  // Remember the collapsed choice on this device (purely a convenience).
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    // No saved choice: tablets (761–1100px wide) start with the slim rail.
    setCollapsed(saved === null ? window.matchMedia("(min-width: 761px) and (max-width: 1100px)").matches : saved === "1");
    setInstalled(isInstalled());
  }, []);

  // Close the phone drawer whenever the page changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const settingsActive = isActive("/settings");
  // On phones the drawer always shows full labels.
  const showRail = collapsed && !mobileOpen;

  return (
    <>
      <header className="mobile-bar">
        <button
          type="button"
          className="btn-outline"
          onClick={() => setMobileOpen(true)}
          aria-expanded={mobileOpen}
          aria-controls="main-menu"
          style={{ minHeight: 44, padding: "0 14px", fontSize: 14 }}
        >
          <Icon name="menu" size={18} />
          Menu
        </button>
        <Link href="/" className="brand-mark">
          <span className="brand-logo">D</span>
          Dashboard
        </Link>
        <span style={{ width: 44 }} aria-hidden="true" />
      </header>

      <button
        type="button"
        className={`scrim${mobileOpen ? " is-open" : ""}`}
        aria-label="Close menu"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => setMobileOpen(false)}
      />

      <nav
        id="main-menu"
        aria-label="Main menu"
        className={`sidebar${showRail ? " is-collapsed" : ""}${mobileOpen ? " is-open" : ""}`}
      >
        {showRail ? (
          <>
            <button type="button" className="rail-toggle desktop-only" onClick={toggleCollapsed} aria-label="Expand menu">
              <Icon name="expand" size={18} />
              Expand
            </button>
            {NAV.flatMap((g) => g.items).map((item) => {
              const href = hrefFor(item);
              return (
                <Link
                  key={href}
                  href={href}
                  className="rail-link"
                  aria-current={isActive(href) ? "page" : undefined}
                  title={item.label}
                >
                  <Icon name={item.icon} />
                  <span>{item.short}</span>
                </Link>
              );
            })}
            <Link
              href="/assistant"
              className="rail-link"
              style={{ marginTop: "auto" }}
              aria-current={pathname === "/assistant" ? "page" : undefined}
              title="Ask The BRIAN"
            >
              <Icon name="sparkle" />
              <span>Ask</span>
            </Link>
            <Link
              href="/settings"
              className="rail-link"
              aria-current={settingsActive ? "page" : undefined}
              title="Settings & connections"
            >
              <Icon name="settings" />
              <span>Settings</span>
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="rail-link" style={{ width: "100%", border: 0, background: "none", cursor: "pointer" }} title="Sign out">
                <Icon name="logout" />
                <span>Sign out</span>
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="brand">
              <Link href="/" className="brand-mark">
                <span className="brand-logo">D</span>
                Dashboard
              </Link>
              <button type="button" className="btn-outline desktop-only" onClick={toggleCollapsed} aria-label="Collapse menu">
                <Icon name="collapse" size={16} />
                Collapse
              </button>
              <button
                type="button"
                className="btn-outline mobile-close"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                style={{ display: mobileOpen ? undefined : "none" }}
              >
                <Icon name="close" size={16} />
                Close
              </button>
            </div>

            {NAV.map((group) => (
              <div className="nav-group" key={group.label}>
                <div className="nav-heading">{group.label}</div>
                {group.items.map((item) => {
                  const href = hrefFor(item);
                  const badge = badges[item.slug];
                  return (
                    <Link
                      key={href}
                      href={href}
                      className="nav-link"
                      aria-current={isActive(href) ? "page" : undefined}
                    >
                      <Icon name={item.icon} />
                      <span className="label">{item.label}</span>
                      {badge ? <span className="nav-badge">{badge}</span> : null}
                    </Link>
                  );
                })}
              </div>
            ))}

            <div className="sidebar-foot">
              <Link href="/assistant" className="nav-link" aria-current={pathname === "/assistant" ? "page" : undefined}>
                <Icon name="sparkle" />
                <span className="label">Ask The BRIAN</span>
              </Link>
              {installed ? null : (
                <Link href="/install" className="nav-link">
                  <Icon name="phone" />
                  <span className="label">Install the app</span>
                </Link>
              )}
              <Link href="/settings" className="nav-link" aria-current={settingsActive ? "page" : undefined}>
                <Icon name="settings" />
                <span className="label">Settings &amp; connections</span>
              </Link>
              <div className="profile">
                <span className="avatar" aria-hidden="true">
                  {initials}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="profile-name profile-email" title={displayName}>
                    {displayName}
                  </div>
                  {userEmail ? (
                    <div className="profile-sub profile-email" title={userEmail}>
                      {userEmail}
                    </div>
                  ) : null}
                </div>
                <form action="/auth/signout" method="post" style={{ marginLeft: "auto" }}>
                  <button type="submit" className="icon-btn" aria-label="Sign out" title="Sign out">
                    <Icon name="logout" size={18} />
                  </button>
                </form>
              </div>
            </div>
          </>
        )}
      </nav>
    </>
  );
}
