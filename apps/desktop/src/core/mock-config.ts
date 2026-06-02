// mock 서버 설정 관리. operation별 소스/데이터셋 설정을 localStorage에 저장하고,
// Rust axum mock 서버(mock_start)에 보낼 라우트 목록으로 변환한다.

import type { ParsedSpec, ParsedOperation } from "./types";
import { loadJSON, saveJSON } from "./storage";
import { generateDataset, extractItemSchema } from "./mock-generator";

// ────────────────────────────────────────────────
// 공개 타입
// ────────────────────────────────────────────────

/** mock 데이터의 출처 */
export type MockSource = "schema" | "ai" | "history" | "manual";

/** operation별 mock 설정 */
export interface MockOperationConfig {
  opId: string;
  enabled: boolean;
  source: MockSource;
  dataset?: unknown[];  // 목록 operation용 데이터셋
  body?: unknown;       // 단건/비-GET operation용 고정 응답
  status: number;
  delayMs: number;
  itemCount: number;    // 자동 생성 개수 (기본 20)
  seed: number;
}

/** mock 서버 전체 설정 */
export interface MockServerConfig {
  port: number;         // 기본 9090
  operations: MockOperationConfig[];
}

/** Rust mock_start로 보내는 라우트 — Rust serde camelCase와 일치해야 함 */
export interface MockRoute {
  method: string;
  path: string;
  status: number;
  dataset?: unknown[];
  body?: unknown;
  delayMs: number;
  idField?: string;
  listWrapper?: string; // 목록 응답 래퍼 속성명 (예: "content")
}

// ────────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────────

export const DEFAULT_MOCK_PORT = 9090;

/** localStorage 키 접두사 */
const STORAGE_KEY_PREFIX = "swaggerman.mock.";

// ────────────────────────────────────────────────
// 내부 헬퍼
// ────────────────────────────────────────────────

/**
 * ParsedOperation의 첫 번째 2xx 응답 상태코드를 숫자로 반환한다.
 * 2xx 응답이 없으면 200을 반환한다.
 */
function firstSuccessStatus(op: ParsedOperation): number {
  const twoxx = op.responses.find((r) => r.statusCode.startsWith("2"));
  if (!twoxx) return 200;
  const n = parseInt(twoxx.statusCode, 10);
  return Number.isNaN(n) ? 200 : n;
}

/** operation 하나에 대한 기본 MockOperationConfig를 생성한다 */
function defaultOpConfig(op: ParsedOperation): MockOperationConfig {
  return {
    opId: op.id,
    enabled: true,
    source: "schema",
    status: firstSuccessStatus(op),
    delayMs: 0,
    itemCount: 20,
    seed: 1,
  };
}

// ────────────────────────────────────────────────
// 공개 함수
// ────────────────────────────────────────────────

/**
 * ParsedSpec의 모든 operation에 대해 기본 MockServerConfig를 생성한다.
 * port=9090, 모든 operation enabled=true, source="schema", itemCount=20, seed=1.
 */
export function defaultMockConfig(spec: ParsedSpec): MockServerConfig {
  return {
    port: DEFAULT_MOCK_PORT,
    operations: spec.operations.map(defaultOpConfig),
  };
}

/**
 * localStorage에서 specUrl에 해당하는 MockServerConfig를 로드한다.
 * 저장된 설정이 없으면 defaultMockConfig를 반환한다.
 * 저장된 설정에 없는 새 operation은 기본값으로 채운다 (스펙이 바뀌어도 동작).
 */
export function loadMockConfig(specUrl: string, spec: ParsedSpec): MockServerConfig {
  const key = `${STORAGE_KEY_PREFIX}${specUrl}`;
  const stored = loadJSON<Partial<MockServerConfig>>(key, {});

  // port: 저장된 값이 없으면 9090
  const port: number = typeof stored.port === "number" ? stored.port : DEFAULT_MOCK_PORT;

  // 저장된 operation 설정을 opId → config 맵으로 변환
  const storedOpsMap = new Map<string, MockOperationConfig>(
    (stored.operations ?? []).map((o) => [o.opId, o]),
  );

  // 현재 스펙의 모든 operation에 대해 저장된 설정 또는 기본값 적용
  const operations: MockOperationConfig[] = spec.operations.map((op) => {
    const saved = storedOpsMap.get(op.id);
    if (saved) return saved;
    // 저장된 설정에 없는 새 operation → 기본값
    return defaultOpConfig(op);
  });

  return { port, operations };
}

/**
 * MockServerConfig를 localStorage에 저장한다.
 * 키: swaggerman.mock.${specUrl}
 */
export function saveMockConfig(specUrl: string, config: MockServerConfig): void {
  const key = `${STORAGE_KEY_PREFIX}${specUrl}`;
  saveJSON(key, config);
}

/**
 * MockServerConfig를 Rust mock_start로 보낼 MockRoute 목록으로 변환한다.
 *
 * - enabled=false인 operation은 제외
 * - 목록 GET (path에 '{' 없음): dataset + listWrapper 라우트
 * - 단건 GET (path에 '{' 있음): 부모 목록 dataset 공유 + idField="id"
 * - POST/PUT/PATCH/DELETE 등: body 라우트
 */
export function buildMockRoutes(spec: ParsedSpec, config: MockServerConfig): MockRoute[] {
  const routes: MockRoute[] = [];

  // opId → config 맵
  const cfgMap = new Map<string, MockOperationConfig>(config.operations.map((c) => [c.opId, c]));

  // 목록 GET operation의 dataset을 미리 수집 (단건 GET이 참조할 수 있도록)
  // path → dataset 맵
  const listDatasetMap = new Map<string, unknown[]>();

  // 1단계: 목록 GET operation을 처리하며 dataset을 listDatasetMap에 저장
  for (const op of spec.operations) {
    const cfg = cfgMap.get(op.id);
    if (!cfg || !cfg.enabled) continue;
    if (op.method !== "GET") continue;
    if (op.path.includes("{")) continue; // path param 있으면 단건 GET

    // 목록 GET
    const dataset = cfg.dataset ?? generateDataset(op, cfg.itemCount, cfg.seed);
    listDatasetMap.set(op.path, dataset);

    // listWrapper 추출
    const twoxxResponse = op.responses.find((r) => r.statusCode.startsWith("2"));
    const itemInfo = extractItemSchema(twoxxResponse?.schema);
    const listWrapper = itemInfo?.listWrapper;

    const route: MockRoute = {
      method: op.method,
      path: op.path,
      status: cfg.status,
      dataset,
      delayMs: cfg.delayMs,
    };
    if (listWrapper !== undefined) {
      route.listWrapper = listWrapper;
    }
    routes.push(route);
  }

  // 2단계: 나머지 operation 처리 (단건 GET, POST/PUT/PATCH/DELETE 등)
  for (const op of spec.operations) {
    const cfg = cfgMap.get(op.id);
    if (!cfg || !cfg.enabled) continue;
    if (op.method === "GET" && !op.path.includes("{")) continue; // 이미 1단계에서 처리

    if (op.method === "GET" && op.path.includes("{")) {
      // 단건 GET: 부모 목록 경로에서 /{...} 이후를 제거
      const parentPath = op.path.replace(/\/\{[^}]+\}.*$/, "");
      const parentDataset = listDatasetMap.get(parentPath)
        ?? cfg.dataset
        ?? generateDataset(op, 1, cfg.seed);

      routes.push({
        method: op.method,
        path: op.path,
        status: cfg.status,
        dataset: parentDataset,
        delayMs: cfg.delayMs,
        idField: "id",
      });
    } else {
      // POST/PUT/PATCH/DELETE 등: body 라우트
      const twoxxResponse = op.responses.find((r) => r.statusCode.startsWith("2"));

      // body 우선순위: 직접 설정 → 스펙 example → 스키마 생성 1건 → { ok: true }
      let body: unknown = cfg.body;
      if (body === undefined) {
        if (twoxxResponse?.example !== undefined) {
          body = twoxxResponse.example;
        } else if (twoxxResponse?.schema) {
          const generated = generateDataset(op, 1, cfg.seed);
          body = generated.length > 0 ? generated[0] : { ok: true };
        } else {
          body = { ok: true };
        }
      }

      routes.push({
        method: op.method,
        path: op.path,
        status: cfg.status,
        body,
        delayMs: cfg.delayMs,
      });
    }
  }

  return routes;
}
