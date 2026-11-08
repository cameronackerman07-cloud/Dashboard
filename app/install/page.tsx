import Link from "next/link";
import type { Metadata } from "next";
import { InstallSteps } from "./InstallSteps";

export const metadata: Metadata = { title: "Install the app" };

// Public, so a friend can read it before signing in.
export default function InstallPage() {
  return (
    <main className="auth">
      <div className="auth-card install-card">
        <div className="auth-brand">
          <span className="brand-logo">D</span>
          Dashboard
        </div>
        <h1 className="auth-title">Install the app</h1>
        <p className="auth-lede">
          Installing puts Dashboard on your Home Screen or Dock so it opens like an app. On iPhone and iPad it&apos;s also the
          only way to get notifications.
        </p>
        <InstallSteps />
        <Link href="/" className="auth-link">
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}
