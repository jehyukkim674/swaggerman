// operation별 메모 + 상태 태그. localStorage 영속화(스펙 URL별 키).
import { loadJSON, saveJSON } from "./storage";

export type ApiStatus = "none" | "deprecated" | "review" | "stable" | "blocked";

export interface ApiNote {
  text: string;
  status: ApiStatus;
  updatedAt: number;
}

/** opId → 노트 */
export type NotesMap = Record<string, ApiNote>;

/** 상태별 표시 메타(라벨/텍스트색/점색). 색은 기존 App.css에서 쓰는 값과 동일. */
export const STATUS_META: Record<ApiStatus, { label: string; color: string; dot: string }> = {
  none: { label: "상태 없음", color: "var(--muted)", dot: "transparent" },
  deprecated: { label: "⚠️ Deprecated", color: "#d29922", dot: "#d29922" },
  review: { label: "🔍 검토중", color: "var(--accent)", dot: "var(--accent)" },
  stable: { label: "✅ 안정", color: "#3fb950", dot: "#3fb950" },
  blocked: { label: "🚫 사용금지", color: "#f85149", dot: "#f85149" },
};

export const STATUS_ORDER: ApiStatus[] = ["none", "deprecated", "review", "stable", "blocked"];

export function emptyNote(): ApiNote {
  return { text: "", status: "none", updatedAt: 0 };
}

/** text가 공백이고 status가 none이면 의미 없는 빈 노트. */
export function isEmptyNote(note: ApiNote): boolean {
  return note.text.trim() === "" && note.status === "none";
}

function storageKey(specUrl: string): string {
  return `swaggerman.notes.${specUrl}`;
}

export function loadNotes(specUrl: string): NotesMap {
  return loadJSON<NotesMap>(storageKey(specUrl), {});
}

/** 저장 시 빈 노트는 제거해 저장소를 정리한다. */
export function saveNotes(specUrl: string, notes: NotesMap): void {
  const cleaned: NotesMap = {};
  for (const [opId, note] of Object.entries(notes)) {
    if (!isEmptyNote(note)) cleaned[opId] = note;
  }
  saveJSON(storageKey(specUrl), cleaned);
}
