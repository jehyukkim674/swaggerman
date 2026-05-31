import { loadJSON, saveJSON } from "../storage";
import type { RequestSuggestion } from "./types";

export interface StoredMessage {
  role: "user" | "assistant";
  text: string;
  suggestion?: RequestSuggestion;
  usage?: { input: number; output: number };
}

export interface StoredChat {
  messages: StoredMessage[];
  sessionId?: string;
  totals: { input: number; output: number };
}

const keyFor = (specUrl: string) => `swaggerman.aichat.${specUrl}`;

/** 깨지거나 형태가 안 맞으면 null. */
export function loadChat(specUrl: string): StoredChat | null {
  if (!specUrl) return null;
  const raw = loadJSON<StoredChat | null>(keyFor(specUrl), null);
  if (!raw || typeof raw !== "object") return null;
  if (!Array.isArray(raw.messages)) return null;
  const totals =
    raw.totals && typeof raw.totals === "object"
      ? { input: Number(raw.totals.input) || 0, output: Number(raw.totals.output) || 0 }
      : { input: 0, output: 0 };
  return { messages: raw.messages, sessionId: raw.sessionId, totals };
}

export function saveChat(specUrl: string, chat: StoredChat): void {
  if (!specUrl) return;
  saveJSON(keyFor(specUrl), chat);
}

export function clearChat(specUrl: string): void {
  if (!specUrl) return;
  localStorage.removeItem(keyFor(specUrl));
}
