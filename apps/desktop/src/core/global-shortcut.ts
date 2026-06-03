// OS 전역 단축키: 키 이벤트 ↔ Tauri accelerator 문자열 변환, 영속화, Rust 등록 래퍼.
import { invoke } from "@tauri-apps/api/core";
import { loadJSON, saveJSON } from "./storage";

export const DEFAULT_SHORTCUT = "CmdOrCtrl+Shift+P";
const STORAGE_KEY = "swaggerman.globalShortcut";

/** 주 키로 인정하는 키: 영문/숫자 단일 글자 또는 F1~F12. */
function normalizeMainKey(key: string): string | null {
  if (/^[a-zA-Z0-9]$/.test(key)) return key.toUpperCase();
  if (/^F([1-9]|1[0-2])$/.test(key)) return key;
  return null;
}

/** KeyboardEvent → Tauri accelerator(예: "CmdOrCtrl+Shift+P"). 유효하지 않으면 null. */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  const main = normalizeMainKey(e.key);
  if (!main) return null; // 주 키(문자/F키)가 아니면 무효 — modifier만이거나 Meta/Shift 등
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("CmdOrCtrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (parts.length === 0) return null; // modifier 없는 단일 키 금지(일반 타이핑 가로채기 방지)
  parts.push(main);
  return parts.join("+");
}

const MAC_SYMBOL: Record<string, string> = {
  CmdOrCtrl: "⌘",
  Alt: "⌥",
  Shift: "⇧",
  Super: "⌘",
};

/** accelerator → 사람이 읽는 표시 문자열. platform "mac"이면 기호. */
export function acceleratorToDisplay(acc: string, platform: "mac" | "other"): string {
  if (!acc) return "";
  const parts = acc.split("+");
  if (platform === "mac") {
    return parts.map((p) => MAC_SYMBOL[p] ?? p).join("");
  }
  // 그 외: CmdOrCtrl → Ctrl
  return parts.map((p) => (p === "CmdOrCtrl" ? "Ctrl" : p)).join("+");
}

export function loadShortcut(): string {
  return loadJSON<string>(STORAGE_KEY, DEFAULT_SHORTCUT);
}

export function saveShortcut(acc: string): void {
  saveJSON(STORAGE_KEY, acc);
}

/** Rust에 전역 단축키 등록(빈 문자열이면 해제). 실패 시 throw. */
export async function registerShortcut(acc: string): Promise<void> {
  if (!acc) {
    await invoke("unregister_global_shortcut");
    return;
  }
  await invoke("register_global_shortcut", { accelerator: acc });
}

export async function unregisterShortcut(): Promise<void> {
  await invoke("unregister_global_shortcut");
}
