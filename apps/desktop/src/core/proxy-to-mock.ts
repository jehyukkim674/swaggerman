// src/core/proxy-to-mock.ts
// 프록시 녹화 → 경로 매칭 operation + Mock 변환.
import type { ParsedOperation, ParsedSpec } from "./types";
import type { ProxyRecord } from "./proxy-client";

/** operation path 템플릿(/pet/{petId})과 실제 경로(/pet/42)를 매칭. {x}는 와일드카드. */
function pathMatches(template: string, actual: string): boolean {
  const t = template.replace(/^\//, "").split("/");
  const a = actual.replace(/^\//, "").split("/");
  if (t.length !== a.length) return false;
  return t.every((seg, i) => (seg.startsWith("{") && seg.endsWith("}")) || seg === a[i]);
}

/** method + path로 매칭되는 operation 반환(없으면 null). 쿼리스트링은 무시. */
export function matchOperation(spec: ParsedSpec, method: string, path: string): ParsedOperation | null {
  const cleanPath = path.split("?")[0];
  return (
    spec.operations.find(
      (op) => op.method.toUpperCase() === method.toUpperCase() && pathMatches(op.path, cleanPath),
    ) ?? null
  );
}

export interface MockTarget {
  opId: string;
  dataset?: unknown[];
  body?: unknown;
}

/** 녹화를 매칭 operation의 Mock 대상으로 변환. 응답이 JSON 배열이면 dataset, 객체면 body,
 *  그 외(JSON 아님)면 원문 문자열을 body로. 매칭 operation 없으면 null. */
export function recordingToMock(spec: ParsedSpec, record: ProxyRecord): MockTarget | null {
  const op = matchOperation(spec, record.method, record.path);
  if (!op) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(record.responseBody);
  } catch {
    return { opId: op.id, body: record.responseBody };
  }
  if (Array.isArray(parsed)) return { opId: op.id, dataset: parsed };
  return { opId: op.id, body: parsed };
}
