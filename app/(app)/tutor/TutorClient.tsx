"use client";

import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { ModelPicker, useAiModel } from "@/components/ModelPicker";
import type { AiModelOption } from "@/lib/ai";
import { askTutor } from "./actions";

type Msg = { role: "user" | "assistant"; content: string; by?: string };

export function TutorClient({ models }: { models: AiModelOption[] }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pending, startTransition] = useTransition();
  const [model, setModel] = useAiModel(models);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function send() {
    const el = inputRef.current;
    const question = el?.value.trim() ?? "";
    if (!question || pending) return;

    const next: Msg[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    if (el) el.value = "";

    startTransition(async () => {
      try {
        const res = await askTutor(
          next.map(({ role, content }) => ({ role, content })),
          model,
        );
        setMessages((cur) => [...cur, { role: "assistant", content: res.text, by: res.model }]);
      } catch {
        setMessages((cur) => [
          ...cur,
          { role: "assistant", content: "Couldn't reach the server. Check your connection and try again." },
        ]);
      }
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <section className="card chat" aria-label="Tutor chat">
      <ModelPicker models={models} value={model} onChange={setModel} />
      <div className="chat-log">
        {messages.length === 0 ? (
          <p className="track-empty">
            Ask about any of your subjects. You&apos;ll get a hint first — ask for the full
            solution whenever you want it.
          </p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`bubble bubble-${m.role}`}>
              <span className="bubble-who">
                {m.role === "user" ? "You" : m.by ? `Tutor · ${m.by}` : "Tutor"}
              </span>
              <p className="bubble-text">{m.content}</p>
            </div>
          ))
        )}
        {pending ? (
          <div className="bubble bubble-assistant">
            <span className="bubble-who">Tutor</span>
            <p className="bubble-text">Thinking…</p>
          </div>
        ) : null}
      </div>
      <div className="chat-input">
        <textarea
          ref={inputRef}
          className="input chat-box"
          placeholder="Ask a question… (Enter to send, Shift+Enter for a new line)"
          aria-label="Your question"
          rows={2}
          onKeyDown={onKeyDown}
        />
        <button type="button" className="btn btn-dark" onClick={send} disabled={pending}>
          <Icon name="arrow" size={16} />
          Send
        </button>
      </div>
    </section>
  );
}
