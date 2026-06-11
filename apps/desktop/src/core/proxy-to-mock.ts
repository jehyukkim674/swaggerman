// src/core/proxy-to-mock.ts
// 프록시 녹화 → 경로 매칭 operation + Mock 변환.
import type { ParsedOperation, ParsedSpec } from "./types";
import type { ProxyRecord } from "./proxy-client";
import { loadMockConfigAsync, type MockServerConfig, type MockRequestEntry } from "./mock-config";
import { savePreset } from "./mock-presets-store";

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

/** baseUrl의 path 접두사를 제거. 브라우저 캡처 녹화는 실제 호스트의 절대 경로라
 *  스펙 매칭 전에 보정이 필요하다. 접두사가 아니거나 baseUrl이 URL이 아니면 원본 그대로. */
export function stripBasePath(path: string, baseUrl: string): string {
  let prefix: string;
  try {
    prefix = new URL(baseUrl).pathname;
  } catch {
    return path;
  }
  prefix = prefix.replace(/\/+$/, "");
  if (!prefix) return path;
  if (path === prefix) return "/";
  if (path.startsWith(prefix + "/")) return path.slice(prefix.length);
  if (path.startsWith(prefix + "?")) return "/" + path.slice(prefix.length);
  return path;
}

/** 녹화를 매칭 operation의 Mock 대상으로 변환. 응답이 JSON 배열이면 dataset, 객체면 body,
 *  그 외(JSON 아님)면 원문 문자열을 body로. 매칭 operation 없으면 null.
 *  baseUrl을 주면 원본 path 매칭 실패 시 base path 접두사를 떼고 재시도(브라우저 캡처용). */
export function recordingToMock(spec: ParsedSpec, record: ProxyRecord, baseUrl?: string): MockTarget | null {
  let op = matchOperation(spec, record.method, record.path);
  if (!op && baseUrl) op = matchOperation(spec, record.method, stripBasePath(record.path, baseUrl));
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

export interface BulkMockResult {
  targets: MockTarget[]; // opId 중복 제거됨(나중 녹화 = 최신이 이김)
  unmatched: number;     // 스펙에 매칭 안 된 녹화 수
  failed: number;        // error가 있는 녹화 수(변환 제외)
}

/** 녹화 전체를 Mock 대상으로 변환. records는 시간순이므로 같은 operation은 최신이 이긴다. */
export function recordingsToMocks(spec: ParsedSpec, records: ProxyRecord[], baseUrl?: string): BulkMockResult {
  const byOp = new Map<string, MockTarget>();
  let unmatched = 0;
  let failed = 0;
  for (const record of records) {
    if (record.error) {
      failed += 1;
      continue;
    }
    const target = recordingToMock(spec, record, baseUrl);
    if (!target) {
      unmatched += 1;
      continue;
    }
    byOp.set(target.opId, target);
  }
  return { targets: [...byOp.values()], unmatched, failed };
}

/** 변환 결과를 MockServerConfig에 반영(enabled, source="manual", dataset/body). */
export function applyMockTargets(cfg: MockServerConfig, targets: MockTarget[]): void {
  for (const t of targets) {
    const op = cfg.operations.find((o) => o.opId === t.opId);
    if (!op) continue;
    op.enabled = true;
    op.source = "manual";
    op.dataset = t.dataset;
    op.body = t.body;
  }
}

/** 녹화 1건을 요청 엔트리로 변환(실제 경로+쿼리 보존). */
export function recordingToRequestEntry(record: ProxyRecord): MockRequestEntry {
  // 첫 '?'에서만 분리 — 쿼리 값 안의 '?'(허용 문자)를 보존한다
  const qIdx = record.path.indexOf("?");
  const pathPart = qIdx < 0 ? record.path : record.path.slice(0, qIdx);
  const queryStr = qIdx < 0 ? "" : record.path.slice(qIdx + 1);
  const query = queryStr
    ? queryStr.split("&").filter(Boolean).map((pair) => {
        const i = pair.indexOf("=");
        return i < 0
          ? { name: pair, value: "" }
          : { name: pair.slice(0, i), value: pair.slice(i + 1) };
      })
    : undefined;
  let body: unknown;
  try {
    body = JSON.parse(record.responseBody);
  } catch {
    body = record.responseBody;
  }
  return {
    id: crypto.randomUUID(),
    method: record.method,
    path: pathPart,
    query,
    status: record.status,
    body,
    delayMs: 0,
  };
}

/** 녹화 전체를 요청 엔트리로. error 녹화 제외, 같은 method+path+query는 최신이 이김. */
export function recordingsToRequestEntries(records: ProxyRecord[]): { entries: MockRequestEntry[]; failed: number } {
  const byKey = new Map<string, MockRequestEntry>();
  let failed = 0;
  for (const r of records) {
    if (r.error) { failed += 1; continue; }
    const e = recordingToRequestEntry(r);
    // 쿼리는 정렬해서 키 생성 — 파라미터 순서만 다른 같은 요청을 중복 저장하지 않는다
    const sortedQuery = (e.query ?? [])
      .map((q) => `${q.name}=${q.value}`)
      .sort()
      .join("&");
    const key = `${e.method} ${e.path}?${sortedQuery}`;
    byKey.set(key, e); // 나중(최신)이 이김
  }
  return { entries: [...byKey.values()], failed };
}

/** saveRecordingsToMock 결과 — 저장된 건수와 제외 건수, 실제 저장 성공 여부. */
export interface SaveRecordingsResult {
  saved: number;     // Mock으로 저장된(매칭된) operation 수
  unmatched: number; // 스펙에 매칭 안 된 녹화 수
  failed: number;    // error가 있는 녹화 수
  persisted: boolean; // 프리셋이 실제로 저장됐는지(false면 저장 실패 — 호출자가 에러 표시)
}

/**
 * 녹화 전체를 **요청 엔트리**로 변환해 제목 붙은 Mock 프리셋으로 IndexedDB에 저장한다.
 * 스펙 operation 매칭 없이 실제 경로를 그대로 보존(같은 템플릿이어도 분리 저장).
 * 저장된 프리셋은 Mock 서버 모달의 프리셋 드롭다운에서 골라 적용한다.
 * 엔트리가 없으면(error 녹화만 있으면) 프리셋을 만들지 않는다(persisted=false).
 */
export async function saveRecordingsToMock(
  spec: ParsedSpec,
  records: ProxyRecord[],
  baseUrl: string,
  specUrl: string,
  title: string,
): Promise<SaveRecordingsResult> {
  void spec; void baseUrl; // 요청 엔트리는 스펙 매칭 불필요(실제 경로 그대로 저장)
  const { entries, failed } = recordingsToRequestEntries(records);
  let persisted = false;
  if (entries.length > 0) {
    const config = await loadMockConfigAsync(specUrl, spec);
    config.requests = [...entries, ...config.requests];
    const preset = await savePreset(specUrl, title, config.operations, config.requests);
    persisted = preset !== null;
  }
  return { saved: entries.length, unmatched: 0, failed, persisted };
}
