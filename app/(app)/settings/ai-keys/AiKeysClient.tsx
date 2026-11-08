"use client";

import { useState } from "react";
import { ReplyLine, useAction } from "@/components/useAction";
import type { KeyMeta, KeyProvider } from "@/lib/ai-keys";
import { removeApiKey, saveAiBudget, saveApiKey, testApiKey } from "./actions";

type Card = { id: KeyProvider; name: string; link: string; linkLabel: string; steps: string[]; note?: string };

// Router order: Gemini → Groq → OpenRouter → Mistral, then the optional jobs key.
const CARDS: Card[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    link: "https://aistudio.google.com/apikey",
    linkLabel: "Google AI Studio",
    steps: [
      "Open Google AI Studio and sign in with a Google account.",
      "Click Get API key, then Create API key.",
      "Copy the key (it starts with AIza) and paste it below.",
    ],
    note: "Best first choice: it can also read photos of handwriting.",
  },
  {
    id: "groq",
    name: "Groq",
    link: "https://console.groq.com/keys",
    linkLabel: "console.groq.com",
    steps: ["Sign up or log in at console.groq.com.", "Open API Keys and click Create API Key.", "Name it “Dashboard”, copy the key (starts with gsk_) and paste it below."],
    note: "Very fast. Copy the key straight away: Groq only shows it once.",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    link: "https://openrouter.ai/settings/keys",
    linkLabel: "openrouter.ai",
    steps: ["Sign up at openrouter.ai.", "Open Keys and click Create API Key.", "Copy the key (starts with sk-or-) and paste it below."],
    note: "Only free models (their names end in :free) are used, so it never charges you.",
  },
  {
    id: "mistral",
    name: "Mistral",
    link: "https://console.mistral.ai/api-keys",
    linkLabel: "console.mistral.ai",
    steps: [
      "Sign up at console.mistral.ai and choose the free Experiment plan (it asks to verify a phone number).",
      "Open API keys and click Create new key.",
      "Copy the key and paste it below.",
    ],
  },
  {
    id: "adzuna",
    name: "Adzuna jobs (optional)",
    link: "https://developer.adzuna.com/signup",
    linkLabel: "developer.adzuna.com",
    steps: ["Register at developer.adzuna.com.", "Open your dashboard and copy the Application ID and Application Key.", "Paste both below. Only the Money ideas agent uses this."],
  },
];

const STATUS: Record<KeyMeta["status"], string> = {
  unchecked: "not tested yet",
  working: "working",
  invalid: "not valid",
  rate_limited: "free limit used up for now",
};

function when(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "today";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function KeyCard({ card, meta, ready }: { card: Card; meta?: KeyMeta; ready: boolean }) {
  const { pending, reply, run } = useAction();
  const [show, setShow] = useState(false);
  const [value, setValue] = useState("");
  const [appId, setAppId] = useState("");

  const status = meta
    ? ["Saved", meta.last4 ? `ends in ${meta.last4}` : null, STATUS[meta.status], when(meta.lastUsedAt) ? `last used ${when(meta.lastUsedAt)}` : null]
        .filter(Boolean)
        .join(" · ")
    : "No key saved";

  return (
    <section className="card" aria-label={card.name}>
      <div className="card-head">
        <h2 className="card-title">{card.name}</h2>
        <span className={meta?.status === "working" ? "chip" : "chip-outline"}>{meta ? STATUS[meta.status] : "Not added"}</span>
      </div>
      <details className="more">
        <summary>How to get a free key</summary>
        <ol className="paste-steps">
          {card.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="field-help">
          Sign-up page:{" "}
          <a href={card.link} target="_blank" rel="noopener noreferrer">
            {card.linkLabel}
          </a>
        </p>
      </details>
      {card.note ? <p className="field-help">{card.note}</p> : null}
      <form
        className="track-fields"
        onSubmit={(e) => {
          e.preventDefault();
          const key = value;
          const id = appId;
          run(
            () => saveApiKey(card.id, key, id),
            () => {
              setValue("");
              setAppId("");
              setShow(false);
            },
          );
        }}
      >
        {card.id === "adzuna" ? (
          <input
            className="input"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="Application ID"
            aria-label="Adzuna application ID"
            autoComplete="off"
            spellCheck={false}
            disabled={!ready}
          />
        ) : null}
        <input
          className="input"
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={meta ? "Paste a new key to replace it" : "Paste key"}
          aria-label={`${card.name} key`}
          autoComplete="off"
          spellCheck={false}
          disabled={!ready}
        />
        <button type="button" className="btn btn-small" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide key" : "Show key"} disabled={!ready}>
          {show ? "Hide" : "Show"}
        </button>
        <button type="submit" className="btn btn-dark" disabled={pending || !ready || !value.trim()}>
          Save
        </button>
      </form>
      <div className="note-actions">
        <span className="card-meta">{status}</span>
        {meta ? (
          <>
            <button type="button" className="btn btn-small" disabled={pending} onClick={() => run(() => testApiKey(card.id))}>
              Test
            </button>
            <button
              type="button"
              className="btn btn-small"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Remove your ${card.name} key from Dashboard?`)) run(() => removeApiKey(card.id));
              }}
            >
              Remove
            </button>
          </>
        ) : null}
      </div>
      <ReplyLine reply={reply} />
    </section>
  );
}

export function AiKeysClient({ meta, ready, budget, usedToday }: { meta: KeyMeta[]; ready: boolean; budget: number; usedToday: number }) {
  const budgetAction = useAction();
  return (
    <>
      {CARDS.map((c) => (
        <KeyCard key={c.id} card={c} meta={meta.find((m) => m.provider === c.id)} ready={ready} />
      ))}
      <section className="card" aria-label="Daily AI limit">
        <h2 className="card-title">Daily AI limit</h2>
        <p className="track-empty">
          A soft cap on AI calls per day across the whole site, so agents can&apos;t use up your free allowance. Used today: {usedToday} of{" "}
          {budget}.
        </p>
        <form
          className="track-fields"
          onSubmit={(e) => {
            e.preventDefault();
            const v = String(new FormData(e.currentTarget).get("budget") ?? "");
            budgetAction.run(() => saveAiBudget(v));
          }}
        >
          <input name="budget" type="number" min={0} max={500} className="input" defaultValue={budget} aria-label="AI calls per day" />
          <button type="submit" className="btn" disabled={budgetAction.pending}>
            Save limit
          </button>
        </form>
        <ReplyLine reply={budgetAction.reply} />
      </section>
    </>
  );
}
