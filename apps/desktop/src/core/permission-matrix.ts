// 권한 매트릭스: 페르소나(토큰)별로 API들을 호출해 상태코드 표를 만든다.
import { loadJSON, saveJSON } from "./storage";

export interface Persona {
  id: string;
  name: string;
  token: string; // Bearer 토큰 값(빈 문자열 = 인증 없음)
}

export interface MatrixCell {
  status: number; // HTTP 상태코드, 0 = 네트워크 오류
  ok: boolean;
  durationMs: number;
  error?: string;
}

/** opId → personaId → cell */
export type MatrixResult = Record<string, Record<string, MatrixCell>>;

export type StatusKind = "success" | "redirect" | "perm" | "error" | "net";

/** 상태코드를 색상 분류로 매핑. 401/403은 권한(perm)으로 강조. */
export function statusKind(status: number): StatusKind {
  if (status === 0) return "net";
  if (status === 401 || status === 403) return "perm";
  if (status >= 200 && status < 300) return "success";
  if (status >= 300 && status < 400) return "redirect";
  return "error";
}

let seq = 0;
function newId(): string {
  return `persona-${Date.now().toString(36)}-${seq++}`;
}

export function defaultPersonas(): Persona[] {
  return [
    { id: newId(), name: "관리자", token: "" },
    { id: newId(), name: "일반", token: "" },
    { id: newId(), name: "게스트", token: "" },
  ];
}

function storageKey(specUrl: string): string {
  return `swaggerman.personas.${specUrl}`;
}

export function loadPersonas(specUrl: string): Persona[] {
  return loadJSON<Persona[]>(storageKey(specUrl), []);
}

export function savePersonas(specUrl: string, personas: Persona[]): void {
  saveJSON(storageKey(specUrl), personas);
}
