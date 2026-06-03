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
/** 새 페르소나 id 생성. 모달에서 addPersona 시에도 재사용한다. */
export function newId(): string {
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

export type RunOne = (opId: string, token: string) => Promise<MatrixCell>;
export type ProgressFn = (done: number, total: number) => void;

/** 각 (op × persona) 조합을 순차 실행해 매트릭스를 만든다.
 *  runOne이 throw하면 해당 셀만 net 에러(status 0)로 기록하고 계속한다. */
export async function runMatrix(
  personas: Persona[],
  opIds: string[],
  runOne: RunOne,
  onProgress?: ProgressFn,
): Promise<MatrixResult> {
  const result: MatrixResult = {};
  const total = opIds.length * personas.length;
  let done = 0;
  for (const opId of opIds) {
    result[opId] = {};
    for (const persona of personas) {
      let cell: MatrixCell;
      try {
        cell = await runOne(opId, persona.token);
      } catch (e) {
        cell = { status: 0, ok: false, durationMs: 0, error: e instanceof Error ? e.message : String(e) };
      }
      result[opId][persona.id] = cell;
      done++;
      onProgress?.(done, total);
    }
  }
  return result;
}
