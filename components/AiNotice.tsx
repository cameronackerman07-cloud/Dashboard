import { Icon } from "@/components/Icon";

// Shown by the AI-powered pages when no provider key is set yet.
export function AiNotice() {
  return (
    <section className="card" aria-label="AI not set up yet">
      <div className="card-head">
        <h2 className="card-title">Add a free AI key to switch this on</h2>
        <span className="chip-outline">AI</span>
      </div>
      <p className="lede" style={{ maxWidth: "none" }}>
        This feature runs on a free AI model. Add any one of these keys in Vercel → Settings →
        Environment Variables, then redeploy — it&apos;ll start working straight away.
      </p>
      <ul className="plan-list">
        <li>
          <Icon name="arrow" size={18} />
          <span>
            <strong>GROQ_API_KEY</strong> — free at console.groq.com (fastest to set up)
          </span>
        </li>
        <li>
          <Icon name="arrow" size={18} />
          <span>
            <strong>GEMINI_API_KEY</strong> — free at aistudio.google.com
          </span>
        </li>
        <li>
          <Icon name="arrow" size={18} />
          <span>
            <strong>OPENROUTER_API_KEY</strong> or <strong>MISTRAL_API_KEY</strong> also work
          </span>
        </li>
      </ul>
    </section>
  );
}
