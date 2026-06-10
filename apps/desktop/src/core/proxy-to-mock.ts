// src/core/proxy-to-mock.ts
// 프록시 녹화 → 경로 매칭 operation + Mock 변환.
import type { ParsedOperation, ParsedSpec } from "./types";
import type { ProxyRecord } from "./proxy-client";
import { loadMockConfig, saveMockConfig, savePreset, type MockServerConfig } from "./mock-config";

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

/** saveRecordingsToMock 결과 — 저장된 건수와 제외 건수. */
export interface SaveRecordingsResult {
  saved: number;     // Mock으로 저장된(매칭된) operation 수
  unmatched: number; // 스펙에 매칭 안 된 녹화 수
  failed: number;    // error가 있는 녹화 수
}

/**
 * 녹화 전체를 **활성 Mock 설정에 적용**하고(=Mock 서버 모달 목록에 바로 반영),
 * 같은 내용을 **제목 붙은 프리셋**으로도 저장한다.
 * 매칭된 녹화(saved>0)가 없으면 활성 설정·프리셋 둘 다 건드리지 않는다.
 */
export function saveRecordingsToMock(
  spec: ParsedSpec,
  records: ProxyRecord[],
  baseUrl: string,
  specUrl: string,
  title: string,
): SaveRecordingsResult {
  const { targets, unmatched, failed } = recordingsToMocks(spec, records, baseUrl);
  if (targets.length > 0) {
    const config = loadMockConfig(specUrl, spec);
    applyMockTargets(config, targets);
    saveMockConfig(specUrl, config);                // 활성 설정 → Mock 서버 목록에 바로 보임
    savePreset(specUrl, title, config.operations);  // 제목 프리셋으로도 보관
  }
  return { saved: targets.length, unmatched, failed };
}
