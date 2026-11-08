import Link from "next/link";

// Shown wherever AI is needed but this user has no key the AI can use yet.
export function AiNotice() {
  return (
    <section className="card" aria-label="Add an AI key">
      <div className="card-head">
        <h2 className="card-title">Add a free AI key in Settings to use this</h2>
        <span className="chip-outline">AI</span>
      </div>
      <p className="lede" style={{ maxWidth: "none" }}>
        AI features run on your own free key from Google Gemini, Groq, OpenRouter or Mistral. It takes about two minutes, and
        the steps are on the AI keys page.
      </p>
      <div className="note-actions">
        <Link href="/settings/ai-keys" className="btn btn-dark">
          Add an AI key
        </Link>
      </div>
    </section>
  );
}
