import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline" };

// Shown by the service worker when there's no connection. Public and static.
export default function OfflinePage() {
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-logo">D</span>
          Dashboard
        </div>
        <h1 className="auth-title">You&apos;re offline</h1>
        <p className="auth-lede">The dashboard needs an internet connection. Check your Wi-Fi or mobile data, then try again.</p>
        <a className="btn btn-dark auth-submit" href="/">
          Try again
        </a>
      </div>
    </main>
  );
}
