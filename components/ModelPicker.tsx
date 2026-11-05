"use client";

import { useEffect, useState } from "react";
import type { AiModelOption } from "@/lib/ai";

const STORAGE_KEY = "dashboard.aiModel";

// The chosen model, shared by all the AI pages and remembered on this device.
// Starts on Auto and reads storage after mount, so server and browser HTML match.
export function useAiModel(models: AiModelOption[]) {
  const [model, setModelState] = useState("auto");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && models.some((m) => m.id === saved)) setModelState(saved);
    } catch {
      // Storage can be blocked (private browsing). Auto still works.
    }
  }, [models]);

  function setModel(next: string) {
    setModelState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // As above: the choice just won't be remembered.
    }
  }

  return [model, setModel] as const;
}

export function ModelPicker({
  models,
  value,
  onChange,
}: {
  models: AiModelOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const providers = [...new Set(models.map((m) => m.provider))];
  const extraCount = models.filter((m) => !m.recommended).length;

  function option(m: AiModelOption) {
    return (
      <option key={m.id} value={m.id}>
        {m.label}
        {m.vision ? " · reads drawings" : ""}
      </option>
    );
  }

  return (
    <div className="model-picker">
      <label className="section-label" htmlFor="ai-model">
        AI model
      </label>
      <select id="ai-model" className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="auto">Auto (uses the next model if one is busy)</option>
        {providers.map((provider) => {
          const mine = models.filter((m) => m.provider === provider);
          const recommended = mine.filter((m) => m.recommended);
          const more = mine.filter((m) => !m.recommended);
          return [
            recommended.length ? (
              <optgroup key={`${provider}-r`} label={`${provider} · recommended`}>
                {recommended.map(option)}
              </optgroup>
            ) : null,
            more.length ? (
              <optgroup key={`${provider}-m`} label={`${provider} · more models`}>
                {more.map(option)}
              </optgroup>
            ) : null,
          ];
        })}
      </select>
      {extraCount > 0 ? (
        <span className="field-help">
          {models.length} models available. The ones under &quot;more models&quot; are untested here, so if one
          fails, Auto takes over.
        </span>
      ) : null}
    </div>
  );
}
