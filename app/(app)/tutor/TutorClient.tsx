"use client";

import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { askTutor } from "./actions";

type Msg = { role: "user" | "assistant"; content: string };

export function TutorClient() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function send() {
    const el = inputRef.current;
    const question = el?.value.trim() ?? "";
    if (!question || pending) return;

    const next: Msg[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    if (el) el.value = "";

    startTransition(async () => {
      const res = await askTutor(next);
      setMessages((cur) => [...cur, { role: "assistant", content: res.text }]);
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
      <div className="chat-log">
        {messages.length === 0 ? (
          <p className="track-empty">
            Ask about any of your subjects. You&apos;ll get a hint first — ask for the full
            solution whenever you want it.
          </p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`bubble bubble-${m.role}`}>
              <span className="bubble-who">{m.role === "user" ? "You" : "Tutor"}</span>
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
