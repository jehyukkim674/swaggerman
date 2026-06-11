# Mock 요청 엔트리 구현 플랜 (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 캡처한 실제 요청을 메서드+경로+쿼리+헤더 단위의 Mock "요청 엔트리"로 저장·서빙하고(같은 스펙 템플릿이어도 안 합쳐짐), 캡처 목록 행 삭제·프리셋 포함·Mock 초기화를 지원한다.

**Architecture:** `mock-config.ts`에 `MockRequestEntry` 추가 → `proxy-to-mock.ts`가 녹화를 엔트리로 변환 → Rust `mock_server.rs`가 요청 엔트리를 스펙 라우트보다 먼저 매칭 → ProxyModal 캡처 목록 행 삭제 → MockServerModal 초기화. 프리셋·활성 config에 requests 포함.

**Tech Stack:** React+TS, vitest(+jsdom+fake-indexeddb), Rust(axum, cargo test).

**스펙:** `docs/superpowers/specs/2026-06-11-mock-request-entries-design.md`

**참고 — 기존 코드:**
- `apps/desktop/src/core/mock-config.ts` — `MockOperationConfig`/`MockServerConfig`/`MockPreset`(15-40행), `MockRoute`(42~), `loadMockConfig`(약 144), `defaultMockConfig`, `applyPresetToConfig`
- `apps/desktop/src/core/proxy-to-mock.ts` — `saveRecordingsToMock`(async), `recordingsToMocks`, `SaveRecordingsResult`
- `apps/desktop/src/core/mock-presets-store.ts` — `savePreset`(async, IndexedDB)
- `apps/desktop/src/core/mock-client.ts` — `startMockServer(port, routes)` → invoke `mock_start {config:{port,routes}}`
- `apps/desktop/src-tauri/src/mock_server.rs` — `MockRoute`(29), `MockConfig`(51), `match_path`(104), `AppState`(226), `fallback_handler`(231: method/path/query/req.headers 접근), `mock_start`(347)
- `apps/desktop/src/components/MockServerModal.tsx` — `handleStart`(191: `buildMockRoutes`→`startMockServer`), 제어바(450), 프리셋바, config state
- `apps/desktop/src/components/ProxyModal.tsx` — 녹화 목록 행(`proxy-rec-row`), `shownRecords`, "전체 Mock으로" bulk row
- `apps/desktop/src/core/proxy-mock-realworld.test.ts` — 실세계 회귀 테스트

**명령어:** 프론트 `cd apps/desktop && npx vitest run <file>` / `npm test` / `npm run typecheck` / `npm run lint`. Rust `cd apps/desktop/src-tauri && cargo test`.

**커밋 trailer(모든 커밋):**
```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| Modify `src/core/mock-config.ts` | `MockMatch`/`MockRequestEntry` 타입, config·preset에 `requests`, default/load 초기화 |
| Modify `src/core/proxy-to-mock.ts` | 녹화→요청엔트리 변환, `saveRecordingsToMock`을 엔트리 저장으로 |
| Modify `src/core/mock-client.ts` | `startMockServer`에 `requests` 전달 |
| Modify `src-tauri/src/mock_server.rs` | `MockRequestEntry`, `match_request_entry`, 핸들러 통합, `MockConfig.requests` |
| Modify `src/components/MockServerModal.tsx` | start 시 requests 전달, **초기화** 버튼 |
| Modify `src/components/ProxyModal.tsx` | 캡처 목록 행 삭제(숨김) + 보이는 것만 저장 |

---

### Task 1: 데이터 모델 — MockRequestEntry + requests 필드

**Files:**
- Modify: `apps/desktop/src/core/mock-config.ts`
- Modify: `apps/desktop/src/core/mock-config.test.ts`

- [ ] **Step 1: 실패 테스트 추가** (mock-config.test.ts 끝, jsdom 환경)

```ts
describe("requests 필드(요청 엔트리)", () => {
  beforeEach(() => localStorage.clear());
  const url = "https://api.test/spec.json";

  it("defaultMockConfig는 requests를 빈 배열로 둔다", () => {
    const spec = makeSpec([makeOp({ id: "GET /x" })]);
    expect(defaultMockConfig(spec).requests).toEqual([]);
  });

  it("loadMockConfig/saveMockConfig가 requests를 보존한다", () => {
    const spec = makeSpec([makeOp({ id: "GET /x" })]);
    const cfg = defaultMockConfig(spec);
    cfg.requests = [
      { id: "r1", method: "GET", path: "/api/v1/code/IP_STATUS", status: 200, body: { ok: true }, delayMs: 0 },
    ];
    saveMockConfig(url, cfg);
    const loaded = loadMockConfig(url, spec);
    expect(loaded.requests).toHaveLength(1);
    expect(loaded.requests![0].path).toBe("/api/v1/code/IP_STATUS");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/core/mock-config.test.ts`
Expected: FAIL — `requests` 없음/undefined

- [ ] **Step 3: 구현** (mock-config.ts)

타입 추가(`MockServerConfig` 위):
```ts
/** 쿼리/헤더 매칭 조건(이름=값) */
export interface MockMatch {
  name: string;
  value: string;
}

/** 실제 요청 단위 Mock 엔트리 (스펙 operation과 별개, 정확 경로 매칭) */
export interface MockRequestEntry {
  id: string;
  method: string;
  path: string;             // 실제 경로(템플릿 아님)
  query?: MockMatch[];      // 쿼리 부분일치
  headers?: MockMatch[];    // 헤더 부분일치(이름 대소문자 무시)
  status: number;
  body?: unknown;           // 응답(JSON/원문)
  delayMs: number;
  note?: string;
}
```

`MockServerConfig`에 필드:
```ts
export interface MockServerConfig {
  port: number;
  operations: MockOperationConfig[];
  requests: MockRequestEntry[];   // ← 추가
}
```

`MockPreset`에 필드:
```ts
export interface MockPreset {
  id: string;
  title: string;
  savedAt: number;
  operations: MockOperationConfig[];
  requests?: MockRequestEntry[];  // ← 추가(구버전 호환 위해 optional)
}
```

`defaultMockConfig` 반환에 `requests: []` 추가:
```ts
export function defaultMockConfig(spec: ParsedSpec): MockServerConfig {
  return {
    port: DEFAULT_MOCK_PORT,
    operations: spec.operations.map(defaultOpConfig),
    requests: [],
  };
}
```

`loadMockConfig` 반환에 requests 포함(저장값 우선, 없으면 []):
```ts
// 함수 끝 return 부분
  return { port, operations, requests: stored.requests ?? [] };
```
(`stored`는 `loadJSON<Partial<MockServerConfig>>(key, {})` 결과 — 이미 있음)

`applyPresetToConfig`도 requests 적용(프리셋 우선, 없으면 config 유지):
```ts
export function applyPresetToConfig(config: MockServerConfig, preset: MockPreset): MockServerConfig {
  const presetMap = new Map(preset.operations.map((o) => [o.opId, o]));
  return {
    port: config.port,
    operations: config.operations.map((o) => {
      const fromPreset = presetMap.get(o.opId);
      return fromPreset ? structuredClone(fromPreset) : o;
    }),
    requests: preset.requests ? structuredClone(preset.requests) : config.requests,
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/core/mock-config.test.ts`
Expected: 기존 + 신규 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/core/mock-config.ts apps/desktop/src/core/mock-config.test.ts
git commit -m "기능: Mock 요청 엔트리 타입 + config/preset requests 필드"
```

---

### Task 2: 녹화 → 요청 엔트리 변환

**Files:**
- Modify: `apps/desktop/src/core/proxy-to-mock.ts`
- Modify: `apps/desktop/src/core/proxy-to-mock.test.ts`
- Modify: `apps/desktop/src/core/proxy-mock-realworld.test.ts`

- [ ] **Step 1: 실패 테스트 추가** (proxy-to-mock.test.ts — saveRecordingsToMock describe 위에 순수함수 테스트)

```ts
import { recordingToRequestEntry, recordingsToRequestEntries } from "./proxy-to-mock";

describe("녹화 → 요청 엔트리", () => {
  it("recordingToRequestEntry는 경로/쿼리/응답을 엔트리로 변환한다", () => {
    const e = recordingToRequestEntry({
      atMs: 1, method: "GET", path: "/api/v1/code/IP_STATUS?activeOnly=true",
      status: 200, responseBody: '[{"id":1}]',
    });
    expect(e.method).toBe("GET");
    expect(e.path).toBe("/api/v1/code/IP_STATUS");
    expect(e.query).toEqual([{ name: "activeOnly", value: "true" }]);
    expect(e.status).toBe(200);
    expect(e.body).toEqual([{ id: 1 }]);
    expect(e.id).toBeTruthy();
  });

  it("JSON 아닌 응답은 원문 문자열 body", () => {
    const e = recordingToRequestEntry({ atMs: 1, method: "GET", path: "/x", status: 200, responseBody: "plain" });
    expect(e.body).toBe("plain");
    expect(e.query).toBeUndefined();
  });

  it("recordingsToRequestEntries는 같은 method+path+query 중 최신이 이기고 실패는 제외한다", () => {
    const { entries, failed } = recordingsToRequestEntries([
      { atMs: 1, method: "GET", path: "/api/v1/code/IP_STATUS", status: 200, responseBody: '{"v":1}' },
      { atMs: 2, method: "GET", path: "/api/v1/code/IP_USAGE", status: 200, responseBody: '{"v":2}' },
      { atMs: 3, method: "GET", path: "/api/v1/code/IP_STATUS", status: 200, responseBody: '{"v":3}' }, // 최신
      { atMs: 4, method: "GET", path: "/api/v1/code/X", status: 500, responseBody: "", error: "boom" },
    ]);
    expect(failed).toBe(1);
    expect(entries).toHaveLength(2);
    const ipStatus = entries.find((e) => e.path === "/api/v1/code/IP_STATUS")!;
    expect(ipStatus.body).toEqual({ v: 3 }); // 최신 이김
    expect(entries.some((e) => e.path === "/api/v1/code/IP_USAGE")).toBe(true);
  });
});
```

또 `saveRecordingsToMock` describe의 첫 테스트를 **엔트리 기반**으로 교체:
```ts
  it("녹화를 요청 엔트리로 프리셋에 저장(persisted)한다", async () => {
    const spec = makeSpec([{ id: "GET /pets", method: "GET", path: "/pets" }]);
    const records: ProxyRecord[] = [
      { atMs: 1, method: "GET", path: "/api/v1/code/IP_STATUS?activeOnly=true", status: 200, responseBody: '[{"id":1}]' },
      { atMs: 2, method: "GET", path: "/api/v1/code/IP_USAGE?activeOnly=true", status: 200, responseBody: '[{"id":2}]' },
    ];
    const res = await mod.saveRecordingsToMock(spec, records, "https://api.test", url, "스냅샷");
    expect(res).toEqual({ saved: 2, unmatched: 0, failed: 0, persisted: true });
    const presets = await storeMod.loadPresets(url);
    expect(presets[0].requests).toHaveLength(2);
    const paths = presets[0].requests!.map((r) => r.path).sort();
    expect(paths).toEqual(["/api/v1/code/IP_STATUS", "/api/v1/code/IP_USAGE"]);
  });
```
(기존 "활성 설정 건드리지 않는다" 테스트의 operation dataset 검증은 제거/대체 — 이제 requests로 저장)

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/core/proxy-to-mock.test.ts`
Expected: FAIL — `recordingToRequestEntry` 없음

- [ ] **Step 3: 구현** (proxy-to-mock.ts)

import에 타입 추가: `import { loadMockConfig, type MockServerConfig, type MockRequestEntry } from "./mock-config";`
(savePreset import은 mock-presets-store에서 — 기존 유지)

함수 추가:
```ts
/** 녹화 1건을 요청 엔트리로 변환(실제 경로+쿼리 보존). */
export function recordingToRequestEntry(record: ProxyRecord): MockRequestEntry {
  const [pathPart, queryStr] = record.path.split("?");
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
    const key = `${e.method} ${e.path}?${(e.query ?? []).map((q) => `${q.name}=${q.value}`).join("&")}`;
    byKey.set(key, e); // 나중(최신)이 이김
  }
  return { entries: [...byKey.values()], failed };
}
```

`saveRecordingsToMock` 교체:
```ts
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
    const config = loadMockConfig(specUrl, spec);
    config.requests = [...entries, ...config.requests];
    const preset = await savePreset(specUrl, title, config.operations, config.requests);
    persisted = preset !== null;
  }
  return { saved: entries.length, unmatched: 0, failed, persisted };
}
```

(주의: `savePreset` 시그니처가 operations만 받으므로 Task 2.5에서 requests 인자를 추가한다 — 아래 Step 3ب)

- [ ] **Step 3b: savePreset에 requests 인자 추가** (`mock-presets-store.ts`)

```ts
export async function savePreset(
  specUrl: string,
  title: string,
  operations: MockOperationConfig[],
  requests?: MockRequestEntry[],
): Promise<MockPreset | null> {
  try {
    const preset: MockPreset = {
      id: crypto.randomUUID(),
      title,
      savedAt: Date.now(),
      operations: structuredClone(operations),
      requests: requests ? structuredClone(requests) : [],
    };
    const list = [preset, ...(await loadPresets(specUrl))];
    const ok = await writeRecord(specUrl, list);
    return ok ? preset : null;
  } catch {
    return null;
  }
}
```
import에 `MockRequestEntry` 타입 추가: `import type { MockOperationConfig, MockPreset, MockRequestEntry } from "./mock-config";`

MockServerModal의 `handleSavePreset`(operations만 넘김)도 requests 추가:
```ts
const saved = await savePreset(specUrl, t, config.operations, config.requests);
```

- [ ] **Step 4: realworld 테스트 갱신** (proxy-mock-realworld.test.ts)

"전체 저장→IndexedDB" 테스트의 검증을 requests 기준으로 변경:
```ts
    const res = await mod.saveRecordingsToMock(spec, records, baseURL, specUrl, "CMDB 스냅샷");
    expect(res.saved).toBeGreaterThan(0);
    expect(res.persisted).toBe(true);
    const presets = await storeMod.loadPresets(specUrl);
    expect(presets[0].requests!.length).toBe(res.saved);
    // IP_STATUS / IP_USAGE가 각각 별도 엔트리로 저장됨
    const codePaths = presets[0].requests!.filter((r) => r.path.includes("/common/code/")).map((r) => r.path);
    expect(new Set(codePaths).size).toBe(codePaths.length); // 중복 없음(합쳐지지 않음)
```
(RECORDED에 `/api/v1/common/code/IP_USAGE?activeOnly=true`도 추가해 2종 코드가 들어가게 한다)

- [ ] **Step 5: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/core/proxy-to-mock.test.ts src/core/proxy-mock-realworld.test.ts && npm run typecheck`
Expected: 전체 PASS, 타입 클린

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/core/proxy-to-mock.ts apps/desktop/src/core/proxy-to-mock.test.ts apps/desktop/src/core/proxy-mock-realworld.test.ts apps/desktop/src/core/mock-presets-store.ts apps/desktop/src/components/MockServerModal.tsx
git commit -m "기능: 녹화를 요청 엔트리로 변환·프리셋 저장 — 같은 템플릿 요청 분리 보존"
```

---

### Task 3: Rust — 요청 엔트리 매칭

**Files:**
- Modify: `apps/desktop/src-tauri/src/mock_server.rs`

- [ ] **Step 1: 실패 테스트 추가** (mock_server.rs `mod tests` 안)

```rust
    fn entry(method: &str, path: &str, query: &[(&str, &str)], headers: &[(&str, &str)]) -> MockRequestEntry {
        MockRequestEntry {
            id: "x".into(),
            method: method.into(),
            path: path.into(),
            query: query.iter().map(|(n, v)| MockMatch { name: n.to_string(), value: v.to_string() }).collect(),
            headers: headers.iter().map(|(n, v)| MockMatch { name: n.to_string(), value: v.to_string() }).collect(),
            status: 200,
            body: Some(serde_json::json!({"ok": true})),
            delay_ms: 0,
        }
    }

    #[test]
    fn request_entry_exact_path_distinguishes_code() {
        let entries = vec![
            entry("GET", "/api/v1/code/IP_STATUS", &[], &[]),
            entry("GET", "/api/v1/code/IP_USAGE", &[], &[]),
        ];
        let q = std::collections::HashMap::new();
        let h = std::collections::HashMap::new();
        let m1 = match_request_entry(&entries, "GET", "/api/v1/code/IP_STATUS", &q, &h);
        assert_eq!(m1.unwrap().path, "/api/v1/code/IP_STATUS");
        let none = match_request_entry(&entries, "GET", "/api/v1/code/OTHER", &q, &h);
        assert!(none.is_none());
    }

    #[test]
    fn request_entry_query_subset_and_specificity() {
        let entries = vec![
            entry("GET", "/search", &[], &[]),                       // 조건 0
            entry("GET", "/search", &[("type", "A")], &[]),          // 조건 1 — 더 구체적
        ];
        let mut q = std::collections::HashMap::new();
        q.insert("type".to_string(), "A".to_string());
        let h = std::collections::HashMap::new();
        // type=A 요청 → 더 구체적인(조건 많은) 엔트리가 이김
        let m = match_request_entry(&entries, "GET", "/search", &q, &h).unwrap();
        assert_eq!(m.query.len(), 1);
        // type=B 요청 → 조건 0 엔트리만 매칭
        let mut q2 = std::collections::HashMap::new();
        q2.insert("type".to_string(), "B".to_string());
        let m2 = match_request_entry(&entries, "GET", "/search", &q2, &h).unwrap();
        assert_eq!(m2.query.len(), 0);
    }

    #[test]
    fn request_entry_header_case_insensitive() {
        let entries = vec![entry("GET", "/x", &[], &[("Authorization", "Bearer t")])];
        let q = std::collections::HashMap::new();
        let mut h = std::collections::HashMap::new();
        h.insert("authorization".to_string(), "Bearer t".to_string()); // 소문자 헤더
        assert!(match_request_entry(&entries, "GET", "/x", &q, &h).is_some());
        let h2 = std::collections::HashMap::new();
        assert!(match_request_entry(&entries, "GET", "/x", &q, &h2).is_none()); // 헤더 없으면 매칭 X
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop/src-tauri && cargo test request_entry`
Expected: FAIL — `MockRequestEntry`/`match_request_entry` 없음

- [ ] **Step 3: 구현** (mock_server.rs)

타입(`MockRoute` 옆):
```rust
#[derive(Clone, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MockMatch {
    pub name: String,
    pub value: String,
}

#[derive(Clone, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MockRequestEntry {
    pub id: String,
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub query: Vec<MockMatch>,
    #[serde(default)]
    pub headers: Vec<MockMatch>,
    pub status: u16,
    #[serde(default)]
    pub body: Option<Value>,
    #[serde(default)]
    pub delay_ms: u64,
}
```

`MockConfig`에 필드:
```rust
pub struct MockConfig {
    pub port: u16,
    pub routes: Vec<MockRoute>,
    #[serde(default)]
    pub requests: Vec<MockRequestEntry>,
}
```

`AppState`에 필드:
```rust
struct AppState {
    routes: Vec<MockRoute>,
    requests: Vec<MockRequestEntry>,
}
```

순수 매칭 함수:
```rust
/// 들어온 요청을 요청 엔트리에 매칭. 메서드+경로 정확일치 + 쿼리/헤더 부분일치.
/// 조건 수(query+header)가 많은(더 구체적인) 엔트리가 우선. 동률이면 먼저 정의된 것.
pub fn match_request_entry<'a>(
    entries: &'a [MockRequestEntry],
    method: &str,
    path: &str,
    query: &HashMap<String, String>,
    headers: &HashMap<String, String>,
) -> Option<&'a MockRequestEntry> {
    let mut best: Option<&MockRequestEntry> = None;
    let mut best_score = -1i32;
    for e in entries {
        if !e.method.eq_ignore_ascii_case(method) || e.path != path {
            continue;
        }
        let q_ok = e.query.iter().all(|m| query.get(&m.name).map(|v| v == &m.value).unwrap_or(false));
        let h_ok = e.headers.iter().all(|m| {
            headers.get(&m.name.to_ascii_lowercase()).map(|v| v == &m.value).unwrap_or(false)
        });
        if q_ok && h_ok {
            let score = (e.query.len() + e.headers.len()) as i32;
            if score > best_score {
                best = Some(e);
                best_score = score;
            }
        }
    }
    best
}
```

핸들러 통합(`fallback_handler`) — 헤더 맵 추출 + 요청 엔트리 먼저:
```rust
async fn fallback_handler(State(state): State<AppState>, req: Request<Body>) -> Response {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let path = uri.path().to_string();
    let query_str = uri.query().unwrap_or("").to_string();

    // 헤더 맵(이름 소문자)
    let headers: HashMap<String, String> = req
        .headers()
        .iter()
        .filter_map(|(k, v)| v.to_str().ok().map(|val| (k.as_str().to_ascii_lowercase(), val.to_string())))
        .collect();

    if method == Method::OPTIONS {
        return build_cors_response(StatusCode::NO_CONTENT, Value::Null);
    }

    let query: HashMap<String, String> = query_str
        .split('&')
        .filter(|s| !s.is_empty())
        .filter_map(|pair| {
            let mut it = pair.splitn(2, '=');
            let k = it.next()?.to_string();
            let v = it.next().unwrap_or("").to_string();
            Some((k, v))
        })
        .collect();

    // 1) 요청 엔트리 먼저
    let (status_code, body_val, delay_ms) = if let Some(e) =
        match_request_entry(&state.requests, method.as_str(), &path, &query, &headers)
    {
        (e.status, e.body.clone().unwrap_or(Value::Null), e.delay_ms)
    } else {
        // 2) 스펙 라우트 폴백
        let matched = state.routes.iter().find_map(|route| {
            if route.method.to_uppercase() != method.as_str() {
                return None;
            }
            let params = match_path(&route.path, &path)?;
            Some((route.clone(), params))
        });
        match matched {
            Some((route, params)) => {
                let delay = route.delay_ms;
                let (status, body) = build_response(&route, &params, &query);
                (status, body, delay)
            }
            None => (404, json!({"error": "no mock route"}), 0),
        }
    };

    if delay_ms > 0 {
        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
    }
    // (로그 기록 블록은 기존 그대로 유지)
    {
        let at_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
        let mut log = request_log().lock().unwrap();
        log.push(MockLogEntry { at_ms, method: method.to_string(), path: path.clone(), status: status_code });
        if log.len() > 200 { let drain_to = log.len() - 200; log.drain(..drain_to); }
    }
    build_cors_response(
        StatusCode::from_u16(status_code).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        body_val,
    )
}
```

`mock_start`에서 AppState 구성:
```rust
    let state = AppState {
        routes: config.routes,
        requests: config.requests,
    };
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/desktop/src-tauri && cargo test`
Expected: 기존 + 신규 전체 PASS, warning 없음

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/mock_server.rs
git commit -m "기능: Rust mock 서버 요청 엔트리 매칭(경로 정확+쿼리/헤더 부분, 스펙 폴백)"
```

---

### Task 4: 프론트 — startMockServer에 requests 전달

**Files:**
- Modify: `apps/desktop/src/core/mock-client.ts`
- Modify: `apps/desktop/src/components/MockServerModal.tsx`

- [ ] **Step 1: 구현** (mock-client.ts)

```ts
import type { MockRoute, MockRequestEntry } from "./mock-config";

export async function startMockServer(
  port: number,
  routes: MockRoute[],
  requests: MockRequestEntry[] = [],
): Promise<number> {
  return invoke<number>("mock_start", { config: { port, routes, requests } });
}
```

MockServerModal `handleStart`:
```ts
    const routes = buildMockRoutes(spec, config);
    const boundPort = await startMockServer(portNum, routes, config.requests);
```

- [ ] **Step 2: 타입/테스트 확인**

Run: `cd apps/desktop && npm run typecheck && npx vitest run src/components/MockServerModal.test.tsx`
Expected: PASS (mock invoke는 인자 무관)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/core/mock-client.ts apps/desktop/src/components/MockServerModal.tsx
git commit -m "기능: Mock 서버 시작 시 요청 엔트리(requests) 전달"
```

---

### Task 5: ProxyModal — 캡처 목록 행 삭제

**Files:**
- Modify: `apps/desktop/src/components/ProxyModal.tsx`
- Modify: `apps/desktop/src/components/ProxyModal.test.tsx`

- [ ] **Step 1: 실패 테스트 추가** (ProxyModal.test.tsx)

```ts
describe("ProxyModal 캡처 목록 행 삭제", () => {
  it("행의 × 삭제 시 그 녹화가 목록에서 사라지고 전체 저장 대상에서 빠진다", async () => {
    const recs: ProxyRecord[] = [
      { atMs: 1, method: "GET", path: "/a", status: 200, responseBody: "[]" },
      { atMs: 2, method: "GET", path: "/b", status: 200, responseBody: "[]" },
    ];
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "proxy_start") return 9091;
      if (cmd === "proxy_recordings") return recs;
      return undefined;
    });
    const onSendAll = vi.fn(async () => "저장됨");
    render(<ProxyModal defaultTarget="https://api.example.com"
      onSendToMock={vi.fn()} onSendAllToMock={onSendAll} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    await screen.findByText("/a");
    // /a 행의 삭제 버튼
    fireEvent.click(screen.getAllByTitle("이 녹화 삭제")[1]); // 최신순 표시라 reverse — /a가 아래쪽일 수 있음; title로 잡되 path 인접 확인
    // 단순화: /a를 지웠다고 가정하기 어려우니, 첫 삭제 후 전체 저장이 1건만 넘기는지 확인
    fireEvent.click(await screen.findByRole("button", { name: "전체 Mock으로" }));
    fireEvent.change(await screen.findByPlaceholderText("프리셋 제목"), { target: { value: "t" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(onSendAll.mock.calls[0][0]).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/components/ProxyModal.test.tsx`
Expected: FAIL — "이 녹화 삭제" 버튼 없음

- [ ] **Step 3: 구현** (ProxyModal.tsx)

상태 추가:
```tsx
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
```
`shownRecords` 계산 뒤에 보이는 것만 필터(숨김 제외). 기존 `shownRecords`를:
```tsx
  const allRecords = isBrowser ? capRecords : records;
  const recKey = (r: ProxyRecord, i: number) => `${r.atMs}-${r.method}-${r.path}-${i}`;
  const shownRecords = allRecords.filter((r, i) => !hiddenIds.has(recKey(r, i)));
```
(주의: 기존 `shownRecords` 정의를 위 형태로 교체. `onSendAllToMock(shownRecords, ...)`은 자동으로 보이는 것만 넘김)

녹화 행에 삭제 버튼 추가(`proxy-rec-row` map, `Mock으로` 버튼 옆):
```tsx
{allRecords.filter((r, i) => !hiddenIds.has(recKey(r, i))).slice().reverse().map((r, i) => {
  // 주의: key/index는 원본 기준이어야 정확. 아래 단순화 버전 사용.
})}
```
실제로는 기존 `[...shownRecords].reverse().map((r, i) => (...))` 안에 삭제 버튼 추가하고, 삭제는 그 항목을 hiddenIds에 추가:
```tsx
                <button className="btn small" title="이 녹화 삭제"
                  onClick={() => setHiddenIds((prev) => {
                    const next = new Set(prev);
                    next.add(recKey(r, allRecords.indexOf(r)));
                    return next;
                  })}>×</button>
```
(키 안정성을 위해 `recKey`는 atMs+method+path 기반으로 충분히 유일. index 대신 `${r.atMs}-${r.method}-${r.path}` 사용 권장 — 동일하면 함께 숨겨져도 무방)

간소화 최종형(권장): `recKey(r) = ${r.atMs}-${r.method}-${r.path}` (index 제거), filter/삭제 모두 이 키 사용.

- [ ] **Step 4: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/components/ProxyModal.test.tsx`
Expected: 전체 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/ProxyModal.tsx apps/desktop/src/components/ProxyModal.test.tsx
git commit -m "기능: 캡처 녹화 목록 행 삭제(숨김) — 불필요 요청 빼고 전체 저장"
```

---

### Task 6: MockServerModal — 초기화 버튼

**Files:**
- Modify: `apps/desktop/src/components/MockServerModal.tsx`
- Modify: `apps/desktop/src/components/MockServerModal.test.tsx`

- [ ] **Step 1: 실패 테스트 추가** (MockServerModal.test.tsx, 프리셋 describe 또는 신규 describe)

```ts
describe("MockServerModal 초기화", () => {
  it("초기화 confirm 후 설정을 기본값으로 되돌린다(요청 엔트리 비움)", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const SPEC = `https://api.example.com/${crypto.randomUUID()}.json`;
    const spec = makeSpec([{ id: "GET /users", method: "GET", path: "/users" }]);
    // 사전: requests가 있는 config 저장
    localStorage.setItem(`swaggerman.mock.${SPEC}`, JSON.stringify({
      port: 9090, operations: [], requests: [{ id: "r1", method: "GET", path: "/x", status: 200, delayMs: 0 }],
    }));
    render(<MockServerModal spec={spec} specUrl={SPEC} history={[]} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    expect(confirmSpy).toHaveBeenCalled();
    // 초기화 후 저장된 config의 requests가 비어야(자동저장 디바운스 고려 waitFor)
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(`swaggerman.mock.${SPEC}`) || "{}");
      expect(saved.requests ?? []).toHaveLength(0);
    });
    confirmSpy.mockRestore();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/components/MockServerModal.test.tsx`
Expected: FAIL — "초기화" 버튼 없음

- [ ] **Step 3: 구현** (MockServerModal.tsx)

핸들러(프리셋 핸들러 근처):
```tsx
  const handleResetConfig = () => {
    if (!window.confirm("Mock 설정을 기본값으로 되돌립니다(요청 엔트리·operation 설정 초기화). 계속할까요?")) return;
    setConfig(defaultMockConfig(spec));
    setSelectedPresetId("");
  };
```
import에 `defaultMockConfig` 추가(이미 mock-config import 있음 — 목록에 추가).

제어 바(`mock-control-bar`)에 버튼 추가(서버 시작 버튼 옆, 실행 중 아닐 때):
```tsx
          {!running && (
            <button className="btn small" onClick={handleResetConfig} title="Mock 설정 초기화">초기화</button>
          )}
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/components/MockServerModal.test.tsx`
Expected: 전체 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/MockServerModal.tsx apps/desktop/src/components/MockServerModal.test.tsx
git commit -m "기능: Mock 설정 초기화 버튼 — 기본값 복원(요청 엔트리 비움)"
```

---

### Task 7: 전체 검증

- [ ] **Step 1: 프론트 전체 + 커버리지 + 타입 + 린트**

Run: `cd apps/desktop && npm run test:coverage && npm run typecheck && npm run lint && npm run build`
Expected: vitest 전체 PASS, 커버리지 게이트(lines 90%) 통과, 타입/린트 0 에러, 빌드 성공

- [ ] **Step 2: Rust 전체**

Run: `cd apps/desktop/src-tauri && cargo test`
Expected: 전체 PASS, warning 없음

- [ ] **Step 3: 실패 시** — 실제 출력 읽고 원인 수정 후 모두 통과까지 반복.

- [ ] **Step 4: Commit**(검증 중 수정 있었으면)

```bash
git add -A && git commit -m "검증: Mock 요청 엔트리 전체 테스트·커버리지 통과 확인"
```

---

## Self-Review 결과

- **스펙 커버리지**: 데이터모델(T1), 캡처→엔트리·프리셋(T2), Rust 매칭 쿼리/헤더/구체성/폴백(T3), 서버 전달(T4), 캡처목록 삭제(T5), 초기화(T6), 검증(T7). 스펙 결정 7항목 모두 태스크 존재.
- **타입 일관성**: `MockRequestEntry`(id,method,path,query?,headers?,status,body?,delayMs,note?) TS ↔ Rust(camelCase serde) 일치. `MockMatch{name,value}` 양쪽 동일. `savePreset(…, requests?)`/`saveRecordingsToMock` 반환 `{saved,unmatched,failed,persisted}` 유지.
- **주의(플랜 실행자)**: T2에서 `saveRecordingsToMock`이 operation dataset 대신 requests로 저장하도록 바뀌므로, 기존 operation 기반 테스트가 있으면 requests 기준으로 교체. T5의 `recKey`는 `${atMs}-${method}-${path}` 단순형 사용 권장.
- **비범위**: 요청 엔트리 수동 추가/편집 UI, 요청 헤더 캡처는 Phase 2.
