import Link from "next/link";

export default function NotFound() {
  return (
    <main className="main main-narrow">
      <h1 className="page-title">Page not found</h1>
      <p className="lede">That page doesn&apos;t exist yet.</p>
      <div>
        <Link href="/" className="btn">
          Back to Home
        </Link>
      </div>
    </main>
  );
}
