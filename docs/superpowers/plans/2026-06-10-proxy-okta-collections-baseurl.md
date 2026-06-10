# 프록시 Okta 대응·Mock 일괄 저장·컬렉션 수정·baseURL 유지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설계 문서 `docs/superpowers/specs/2026-06-10-proxy-okta-collections-baseurl-design.md`의 4개 기능 — C(baseURL 프로젝트별 유지) → A(프록시 녹화 전체→Mock) → B(컬렉션 요청 수정: 인라인+덮어쓰기) → D(프록시 쿠키/리다이렉트/TLS 패스스루) — 을 구현한다.

**Architecture:** 프런트는 React+TS(vitest/jsdom, TDD), 백엔드는 Tauri Rust(axum 리버스 프록시, cargo test). 각 기능은 독립 커밋 단위로 분리되어 어느 시점에 멈춰도 동작하는 상태를 유지한다.

**Tech Stack:** React 18, TypeScript, vitest + @testing-library/react, Tauri v2, axum 0.8, reqwest 0.12(rustls-tls·gzip)

**작업 디렉터리:** 모든 프런트 명령은 `apps/desktop/`, Rust 명령은 `apps/desktop/src-tauri/`에서 실행한다.

---

## 사전 참고 — 현재 코드의 핵심 사실

- `App.tsx:664` 스펙 로드 공용 적용부가 매번 `servers`에서 baseURL을 재계산해 덮어쓴다(④ 버그 원인).
- `SavedRequest`(collections.ts)는 절대 URL 스냅샷. `savedToRequest`가 만드는 ad-hoc operation id는 `saved:<id>`.
- `proxy_server.rs`는 응답에서 Content-Type만 보존, reqwest 기본 클라이언트(리다이렉트 자동 추적, TLS 검증 강제).
- Cargo.toml reqwest features: `rustls-tls, charset, gzip, multipart, cookies` — gzip이 켜져 있어 Accept-Encoding을 reqwest에 맡기면 자동 해제된다(br/zstd는 못 풂 → 클라이언트의 accept-encoding을 전달하면 안 됨).
- 테스트 명령: 프런트 `npm test`(=vitest run) / `npm run typecheck` / `npm run lint`, Rust `cargo test`.
- `types.ts:5`에 `HTTP_METHODS` 상수, `icons.tsx`에 `ReplayIcon` 있음(연필 아이콘은 없어 추가 필요).

---

### Task 1: C — baseURL 프로젝트별 저장/복원 + 리셋 버튼

설계 결정에 따라 **자동 테스트 없음**(적용부가 `saved || derived` 한 줄). 수동 검증 2건은 Task 10에서.

**Files:**
- Modify: `apps/desktop/src/App.tsx` (5곳: 저장 effect, loadSpec 적용부, resetBaseURL 함수, config-bar 버튼, removeProject)

- [ ] **Step 1: 저장 effect 추가**

`App.tsx`의 `activeEnvName` 저장 effect(약 165-167행) 바로 아래에 추가:

```ts
// 사용자가 바꾼 baseURL을 프로젝트별로 저장(리로드/프로젝트 전환 시 복원). 빈 값은 저장하지 않는다.
useEffect(() => {
  if (activeSpecUrl && baseURL) saveJSON(`swaggerman.baseURL.${activeSpecUrl}`, baseURL);
}, [baseURL, activeSpecUrl]);
```

- [ ] **Step 2: loadSpec 공용 적용부에서 저장값 우선 복원**

`App.tsx:663-668`의 기존 코드:

```ts
setSpec(parsed);
setBaseURL(
  isFileProject(targetUrl)
    ? pickFileBaseURL(parsed.servers)
    : deriveBaseURL(targetUrl, parsed.servers),
);
```

를 다음으로 교체:

```ts
setSpec(parsed);
// 사용자가 바꾼 baseURL(프로젝트별 저장)이 있으면 우선, 없으면 스펙에서 계산
const derivedBase = isFileProject(targetUrl)
  ? pickFileBaseURL(parsed.servers)
  : deriveBaseURL(targetUrl, parsed.servers);
setBaseURL(loadJSON(`swaggerman.baseURL.${targetUrl}`, "") || derivedBase);
```

- [ ] **Step 3: resetBaseURL 함수 추가**

`removeProject`(약 727행) 위에 추가:

```ts
// baseURL을 스펙 계산값으로 복원(저장값 삭제). 스펙의 서버 주소가 바뀐 경우의 탈출구.
function resetBaseURL() {
  if (!spec) return;
  const url = activeSpecUrl || specUrl;
  localStorage.removeItem(`swaggerman.baseURL.${url}`);
  setBaseURL(isFileProject(url) ? pickFileBaseURL(spec.servers) : deriveBaseURL(url, spec.servers));
  setActiveEnvName("");
}
```

- [ ] **Step 4: config-bar에 리셋 버튼 추가**

`App.tsx` Base URL `<label className="config-field">…</label>`(약 1386-1399행) 닫는 태그 바로 뒤, `<div className="env-bar">` 앞에 추가:

```tsx
<button className="icon-btn" title="스펙 기본값으로 복원" onClick={resetBaseURL} disabled={!spec}>
  <ReplayIcon size={14} />
</button>
```

`ReplayIcon`이 `App.tsx`의 `./components/icons` import에 없으면 추가한다.

- [ ] **Step 5: removeProject에 키 정리 추가**

`removeProject`의 `localStorage.removeItem` 목록(729-733행)에 한 줄 추가:

```ts
localStorage.removeItem(`swaggerman.baseURL.${url}`);
```

- [ ] **Step 6: 검증**

Run: `cd apps/desktop && npm run typecheck && npm test`
Expected: 타입 오류 0, 기존 테스트 전부 PASS

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/App.tsx
git commit -m "수정: baseURL을 프로젝트별로 저장/복원 — https로 바꿔도 리로드 시 http로 원복되던 문제 + 스펙 기본값 리셋 버튼"
```

---

### Task 2: A(core) — recordingsToMocks + applyMockTargets (TDD)

**Files:**
- Modify: `apps/desktop/src/core/proxy-to-mock.ts`
- Test: `apps/desktop/src/core/proxy-to-mock.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`proxy-to-mock.test.ts` 상단 import를 다음으로 바꾸고:

```ts
import { matchOperation, recordingToMock, recordingsToMocks, applyMockTargets } from "./proxy-to-mock";
import { defaultMockConfig } from "./mock-config";
```

파일 끝에 추가:

```ts
describe("recordingsToMocks", () => {
  it("녹화 전체를 변환하고 같은 operation은 최신 녹화가 이긴다", () => {
    const result = recordingsToMocks(spec, [
      rec({ atMs: 1, responseBody: '[{"id":1}]' }),
      rec({ atMs: 2, method: "POST", path: "/pet", responseBody: '{"ok":true}' }),
      rec({ atMs: 3, responseBody: '[{"id":2}]' }), // 같은 GET /pet/findByStatus → 이게 이김
    ]);
    expect(result.targets).toHaveLength(2);
    const list = result.targets.find((t) => t.opId === "GET /pet/findByStatus");
    expect(list?.dataset).toEqual([{ id: 2 }]);
    expect(result.unmatched).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("매칭 안 되는 녹화와 실패 녹화는 제외하고 센다", () => {
    const result = recordingsToMocks(spec, [
      rec({ path: "/nope" }),
      rec({ error: "포워딩 실패", responseBody: "" }),
      rec({ responseBody: "[]" }),
    ]);
    expect(result.targets).toHaveLength(1);
    expect(result.unmatched).toBe(1);
    expect(result.failed).toBe(1);
  });
});

describe("applyMockTargets", () => {
  it("대상 operation에 enabled·manual·dataset/body를 설정한다", () => {
    const cfg = defaultMockConfig(spec);
    cfg.operations[0].enabled = false;
    applyMockTargets(cfg, [
      { opId: "GET /pet/findByStatus", dataset: [{ id: 1 }] },
      { opId: "POST /pet", body: { ok: true } },
    ]);
    const list = cfg.operations.find((o) => o.opId === "GET /pet/findByStatus")!;
    expect(list.enabled).toBe(true);
    expect(list.source).toBe("manual");
    expect(list.dataset).toEqual([{ id: 1 }]);
    const post = cfg.operations.find((o) => o.opId === "POST /pet")!;
    expect(post.body).toEqual({ ok: true });
  });

  it("없는 opId는 무시한다", () => {
    const cfg = defaultMockConfig(spec);
    expect(() => applyMockTargets(cfg, [{ opId: "ghost" }])).not.toThrow();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/core/proxy-to-mock.test.ts`
Expected: FAIL — "recordingsToMocks is not a function" 류

- [ ] **Step 3: 구현**

`proxy-to-mock.ts`에 import 추가 후 파일 끝에 구현:

```ts
import type { MockServerConfig } from "./mock-config";
```

```ts
export interface BulkMockResult {
  targets: MockTarget[]; // opId 중복 제거됨(나중 녹화 = 최신이 이김)
  unmatched: number;     // 스펙에 매칭 안 된 녹화 수
  failed: number;        // error가 있는 녹화 수(변환 제외)
}

/** 녹화 전체를 Mock 대상으로 변환. records는 시간순이므로 같은 operation은 최신이 이긴다. */
export function recordingsToMocks(spec: ParsedSpec, records: ProxyRecord[]): BulkMockResult {
  const byOp = new Map<string, MockTarget>();
  let unmatched = 0;
  let failed = 0;
  for (const record of records) {
    if (record.error) {
      failed += 1;
      continue;
    }
    const target = recordingToMock(spec, record);
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
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/core/proxy-to-mock.test.ts`
Expected: PASS (기존 + 신규 전부)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/core/proxy-to-mock.ts apps/desktop/src/core/proxy-to-mock.test.ts
git commit -m "기능: 프록시 녹화 일괄 변환 recordingsToMocks + applyMockTargets (최신 녹화 우선)"
```

---

### Task 3: A(UI) — ProxyModal "전체 Mock으로" + App 배선 (TDD)

**Files:**
- Modify: `apps/desktop/src/components/ProxyModal.tsx`
- Modify: `apps/desktop/src/App.tsx` (import, `sendRecordingToMock` 정리, `sendAllRecordingsToMock` 추가, ProxyModal props)
- Modify: `apps/desktop/src/App.css`
- Test: `apps/desktop/src/components/ProxyModal.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`ProxyModal.test.tsx`의 `renderModal` 헬퍼를 교체(반환은 기존과 동일하게 onSendToMock):

```tsx
function renderModal(onSendToMock = vi.fn(), onSendAllToMock = vi.fn(() => "")) {
  render(
    <ProxyModal
      defaultTarget="https://api.example.com"
      onSendToMock={onSendToMock}
      onSendAllToMock={onSendAllToMock}
      onClose={vi.fn()}
    />,
  );
  return onSendToMock;
}
```

직접 `render(<ProxyModal …/>)` 하는 기존 테스트 1곳("타깃이 비면 시작 버튼이 비활성")에 `onSendAllToMock={vi.fn(() => "")}` prop을 추가한다. 그리고 새 테스트 추가:

```tsx
it("'전체 Mock으로' 클릭 시 녹화 전체를 넘기고 결과 메시지를 표시한다", async () => {
  const recs: ProxyRecord[] = [
    { atMs: 1, method: "GET", path: "/pet", status: 200, responseBody: "[]" },
    { atMs: 2, method: "POST", path: "/pet", status: 201, responseBody: "{}" },
  ];
  invokeMock.mockImplementation(async (cmd: unknown) => {
    if (cmd === "proxy_start") return 9091;
    if (cmd === "proxy_recordings") return recs;
    return undefined;
  });
  const onSendAll = vi.fn(() => "Mock 저장 2건");
  render(
    <ProxyModal
      defaultTarget="https://api.example.com"
      onSendToMock={vi.fn()}
      onSendAllToMock={onSendAll}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "시작" }));
  const btn = await screen.findByRole("button", { name: "전체 Mock으로" });
  fireEvent.click(btn);
  expect(onSendAll).toHaveBeenCalledWith(recs);
  expect(screen.getByText("Mock 저장 2건")).toBeTruthy();
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/components/ProxyModal.test.tsx`
Expected: FAIL — Props에 onSendAllToMock 없음(TS) / "전체 Mock으로" 버튼 없음

- [ ] **Step 3: ProxyModal 구현**

`ProxyModal.tsx` Props에 추가:

```ts
  /** 녹화 전체를 Mock으로 일괄 저장(App이 매칭·저장). 결과 메시지 반환 */
  onSendAllToMock: (records: ProxyRecord[]) => string;
```

컴포넌트 시그니처에 `onSendAllToMock` 추가:

```ts
export function ProxyModal({ defaultTarget, onSendToMock, onSendAllToMock, onClose }: Props) {
```

`<div className="proxy-records">` 안, 빈 목록 hint 다음에 추가:

```tsx
{records.length > 0 && (
  <div className="proxy-bulk-row">
    <button className="btn small" onClick={() => setSendMsg(onSendAllToMock(records))}>
      전체 Mock으로
    </button>
  </div>
)}
```

`App.css`에 추가(프록시 모달 스타일 근처):

```css
.proxy-bulk-row { display: flex; justify-content: flex-end; margin-bottom: 6px; }
```

- [ ] **Step 4: App 배선**

`App.tsx:83` import 교체:

```ts
import { recordingToMock, recordingsToMocks, applyMockTargets } from "./core/proxy-to-mock";
```

`sendRecordingToMock`(262-277행)의 수동 반영 부분을 `applyMockTargets`로 정리하고, 바로 아래 일괄 함수 추가:

```ts
// 프록시 녹화를 Mock 데이터로 저장. 결과 메시지 반환.
function sendRecordingToMock(record: ProxyRecord): string {
  if (!spec) return "스펙이 로드되지 않았습니다";
  const target = recordingToMock(spec, record);
  if (!target) return `스펙에 없는 경로입니다: ${record.method} ${record.path}`;
  const url = activeSpecUrl || specUrl;
  const cfg = loadMockConfig(url, spec);
  applyMockTargets(cfg, [target]);
  saveMockConfig(url, cfg);
  return `Mock 저장됨: ${target.opId}`;
}

// 프록시 녹화 전체를 Mock으로 일괄 저장. 같은 operation은 최신 녹화가 이긴다.
function sendAllRecordingsToMock(records: ProxyRecord[]): string {
  if (!spec) return "스펙이 로드되지 않았습니다";
  const { targets, unmatched, failed } = recordingsToMocks(spec, records);
  if (targets.length === 0) return "저장할 녹화가 없습니다(스펙에 없는 경로거나 실패한 녹화)";
  const url = activeSpecUrl || specUrl;
  const cfg = loadMockConfig(url, spec);
  applyMockTargets(cfg, targets);
  saveMockConfig(url, cfg);
  const parts = [`Mock 저장 ${targets.length}건`];
  if (unmatched > 0) parts.push(`스펙에 없는 경로 ${unmatched}건 제외`);
  if (failed > 0) parts.push(`실패 녹화 ${failed}건 제외`);
  return parts.join(", ");
}
```

ProxyModal 렌더(1704-1710행)에 prop 추가:

```tsx
<ProxyModal
  defaultTarget={baseURL}
  onSendToMock={sendRecordingToMock}
  onSendAllToMock={sendAllRecordingsToMock}
  onClose={() => setProxyOpen(false)}
/>
```

- [ ] **Step 5: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/components/ProxyModal.test.tsx && npm run typecheck`
Expected: PASS / 타입 오류 0

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/ProxyModal.tsx apps/desktop/src/components/ProxyModal.test.tsx apps/desktop/src/App.tsx apps/desktop/src/App.css
git commit -m "기능: 프록시 녹화 '전체 Mock으로' 일괄 저장 버튼"
```

---

### Task 4: B-1 — 컬렉션 저장 요청 인라인 편집 (TDD)

**Files:**
- Modify: `apps/desktop/src/components/icons.tsx` (EditIcon 추가)
- Modify: `apps/desktop/src/components/CollectionsModal.tsx`
- Test: `apps/desktop/src/components/CollectionsModal.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`CollectionsModal.test.tsx`에 추가:

```tsx
describe("인라인 편집", () => {
  it("✏️ 수정 클릭 시 인라인 폼이 열리고 저장하면 onChange에 반영된다(헤더·바디·id 보존)", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByTitle("수정"));
    fireEvent.change(screen.getByDisplayValue("https://x/users"), { target: { value: "https://y/users" } });
    fireEvent.change(screen.getByDisplayValue("유저 조회"), { target: { value: "유저 목록" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    const updated = vi.mocked(onChange).mock.calls[0][0] as Collection[];
    const r = updated[0].requests[0];
    expect(r.id).toBe("r1");
    expect(r.url).toBe("https://y/users");
    expect(r.name).toBe("유저 목록");
    expect(r.headers).toEqual([]);
    expect(r.body).toBe("");
  });

  it("URL을 비우면 저장 버튼이 비활성화된다", () => {
    setup();
    fireEvent.click(screen.getByTitle("수정"));
    fireEvent.change(screen.getByDisplayValue("https://x/users"), { target: { value: "" } });
    expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("취소하면 편집 폼이 닫히고 변경되지 않는다", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByTitle("수정"));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("유저 조회")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/components/CollectionsModal.test.tsx`
Expected: FAIL — `getByTitle("수정")` 요소 없음

- [ ] **Step 3: EditIcon 추가**

`icons.tsx` 끝에 추가(기존 IconProps 패턴 그대로):

```tsx
export function EditIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}
```

- [ ] **Step 4: CollectionsModal 구현**

import 추가:

```ts
import { HTTP_METHODS } from "../core/types";
import { CloseCircleIcon, TrashIcon, EditIcon } from "./icons";
```

컴포넌트 상태·핸들러 추가(`msg` 상태 아래):

```ts
// 인라인 편집(한 번에 한 행): 이름·메서드·URL만. 헤더/바디는 불러오기→덮어쓰기로 수정.
const [editingId, setEditingId] = useState<string | null>(null);
const [draft, setDraft] = useState({ name: "", method: "GET", url: "" });

const startEdit = (r: SavedRequest) => {
  setEditingId(r.id);
  setDraft({ name: r.name, method: r.method, url: r.url });
};

const saveEdit = (colId: string, reqId: string) => {
  onChange(
    collections.map((c) =>
      c.id === colId
        ? {
            ...c,
            requests: c.requests.map((r) =>
              r.id === reqId
                ? { ...r, name: draft.name.trim() || draft.url.trim(), method: draft.method, url: draft.url.trim() }
                : r,
            ),
          }
        : c,
    ),
  );
  setEditingId(null);
};
```

requests 렌더(`col.requests.map`)를 편집 분기로 교체:

```tsx
{col.requests.map((r) =>
  editingId === r.id ? (
    <div className="saved-row saved-edit" key={r.id}>
      <Select
        value={draft.method}
        onChange={(m) => setDraft((d) => ({ ...d, method: m }))}
        options={HTTP_METHODS.map((m) => ({ value: m, label: m }))}
      />
      <input
        className="kv-input"
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        placeholder="요청 이름"
        spellCheck={false}
      />
      <input
        className="kv-input saved-edit-url"
        value={draft.url}
        onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
        placeholder="https://api.example.com/path"
        spellCheck={false}
      />
      <button className="btn small primary" disabled={!draft.url.trim()} onClick={() => saveEdit(col.id, r.id)}>
        저장
      </button>
      <button className="btn small" onClick={() => setEditingId(null)}>
        취소
      </button>
    </div>
  ) : (
    <div className="saved-row" key={r.id}>
      <span className="method-mini" style={{ color: methodColor(r.method) }}>
        {r.method}
      </span>
      <span className="saved-name" title={r.url}>
        {r.folder ? <span className="saved-folder">{r.folder}/</span> : null}
        {r.name}
      </span>
      <button
        className="btn small"
        onClick={() => {
          onLoad(r);
          onClose();
        }}
      >
        불러오기
      </button>
      <button className="icon-btn" title="수정" onClick={() => startEdit(r)}>
        <EditIcon size={14} />
      </button>
      <button className="icon-btn" onClick={() => removeRequest(col.id, r.id)} title="삭제">
        <CloseCircleIcon size={15} />
      </button>
    </div>
  ),
)}
```

`App.css`에 추가:

```css
.saved-edit { gap: 6px; }
.saved-edit-url { flex: 1; min-width: 200px; }
```

- [ ] **Step 5: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/components/CollectionsModal.test.tsx && npm run typecheck`
Expected: PASS / 타입 오류 0

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/icons.tsx apps/desktop/src/components/CollectionsModal.tsx apps/desktop/src/components/CollectionsModal.test.tsx apps/desktop/src/App.css
git commit -m "기능: 컬렉션 저장 요청 인라인 편집(이름·메서드·URL)"
```

---

### Task 5: B-2 — "불러온 요청에 덮어쓰기" (TDD)

**Files:**
- Modify: `apps/desktop/src/components/CollectionsModal.tsx`
- Modify: `apps/desktop/src/App.tsx` (CollectionsModal에 loadedSavedId 전달)
- Test: `apps/desktop/src/components/CollectionsModal.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`CollectionsModal.test.tsx`에 추가:

```tsx
describe("불러온 요청에 덮어쓰기", () => {
  it("loadedSavedId가 있으면 덮어쓰기 버튼으로 해당 요청을 교체한다(이름 보존)", () => {
    const { onChange } = setup({ current: CURRENT, loadedSavedId: "r1" });
    fireEvent.click(screen.getByRole("button", { name: "불러온 요청에 덮어쓰기" }));
    const updated = vi.mocked(onChange).mock.calls[0][0] as Collection[];
    const r = updated[0].requests[0];
    expect(r.id).toBe("r1");
    expect(r.name).toBe("유저 조회"); // 이름 입력이 없으면 기존 이름 유지
    expect(r.method).toBe("POST");
    expect(r.url).toBe("https://x/users");
    expect(r.headers).toEqual([{ key: "A", value: "1" }]); // enabled 헤더만 저장
    expect(r.body).toBe('{"a":1}');
  });

  it("loadedSavedId가 컬렉션에 없으면 덮어쓰기 버튼을 숨긴다", () => {
    setup({ current: CURRENT, loadedSavedId: "ghost" });
    expect(screen.queryByRole("button", { name: "불러온 요청에 덮어쓰기" })).toBeNull();
  });

  it("loadedSavedId가 없으면 덮어쓰기 버튼이 없다", () => {
    setup({ current: CURRENT });
    expect(screen.queryByRole("button", { name: "불러온 요청에 덮어쓰기" })).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/components/CollectionsModal.test.tsx`
Expected: FAIL — loadedSavedId prop 없음(TS) / 버튼 없음

- [ ] **Step 3: CollectionsModal 구현**

Props에 추가:

```ts
  /** 현재 편집 중인 요청이 컬렉션에서 불러온 것이면 그 SavedRequest id (App이 selected.id "saved:" 접두사에서 파생) */
  loadedSavedId?: string | null;
```

컴포넌트 시그니처에 `loadedSavedId`를 추가하고, `saveCurrent` 아래에 추가:

```ts
// 불러온 요청 덮어쓰기: method/url/headers/body 교체, 이름은 입력 없으면 보존, id/folder 보존
const loadedCol = loadedSavedId
  ? collections.find((c) => c.requests.some((r) => r.id === loadedSavedId))
  : undefined;

const overwriteLoaded = () => {
  if (!current || !loadedSavedId || !loadedCol) return;
  let updatedName = "";
  onChange(
    collections.map((c) =>
      c.id !== loadedCol.id
        ? c
        : {
            ...c,
            requests: c.requests.map((r) => {
              if (r.id !== loadedSavedId) return r;
              updatedName = saveName.trim() || r.name;
              return {
                ...r,
                name: updatedName,
                method: current.method,
                url: current.url,
                headers: current.headers.filter((h) => h.enabled && h.key).map((h) => ({ key: h.key, value: h.value })),
                body: current.body,
              };
            }),
          },
    ),
  );
  setSaveName("");
  setMsg(`『${updatedName}』에 덮어썼습니다.`);
};
```

저장 패널(`{current && (<div className="col-save">…`)의 "현재 요청 저장" 버튼 뒤에 추가:

```tsx
{loadedCol && (
  <button className="btn small" onClick={overwriteLoaded} title="불러온 저장 요청을 현재 편집 내용으로 교체">
    불러온 요청에 덮어쓰기
  </button>
)}
```

- [ ] **Step 4: App 배선**

`App.tsx` CollectionsModal 렌더(1749-1768행)에 prop 추가:

```tsx
loadedSavedId={selected && selected.id.startsWith("saved:") ? selected.id.slice("saved:".length) : null}
```

- [ ] **Step 5: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/components/CollectionsModal.test.tsx && npm run typecheck`
Expected: PASS / 타입 오류 0

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/CollectionsModal.tsx apps/desktop/src/components/CollectionsModal.test.tsx apps/desktop/src/App.tsx
git commit -m "기능: 컬렉션 '불러온 요청에 덮어쓰기' — 메인 편집기로 수정 후 원본 갱신"
```

---

### Task 6: D — Set-Cookie/Location 재작성 헬퍼 (Rust, TDD)

**Files:**
- Modify: `apps/desktop/src-tauri/src/proxy_server.rs`

- [ ] **Step 1: 실패하는 테스트 작성**

`proxy_server.rs`의 `mod tests`에 추가:

```rust
#[test]
fn set_cookie_rewritten_for_localhost() {
    // Domain(도메인 불일치 거부)·Secure(http localhost)·SameSite=None(Secure 필수) 제거
    assert_eq!(
        rewrite_set_cookie("sid=abc; Domain=.okta.com; Path=/; Secure; HttpOnly; SameSite=None"),
        "sid=abc; Path=/; HttpOnly"
    );
    // 그 외 속성은 보존
    assert_eq!(
        rewrite_set_cookie("a=1; Path=/; SameSite=Lax; Max-Age=3600"),
        "a=1; Path=/; SameSite=Lax; Max-Age=3600"
    );
}

#[test]
fn location_rewritten_only_for_target_prefix() {
    assert_eq!(
        rewrite_location("https://api.test/login", "https://api.test", 9091),
        "http://localhost:9091/login"
    );
    // base 끝 슬래시 정리 + 경로 없는 정확 일치
    assert_eq!(
        rewrite_location("https://api.test", "https://api.test/", 9091),
        "http://localhost:9091"
    );
    // 다른 호스트(Okta 등)는 그대로
    assert_eq!(
        rewrite_location("https://acme.okta.com/authorize", "https://api.test", 9091),
        "https://acme.okta.com/authorize"
    );
    // 접두사가 우연히 같은 다른 호스트는 재작성하지 않음
    assert_eq!(
        rewrite_location("https://api.test.evil.com/x", "https://api.test", 9091),
        "https://api.test.evil.com/x"
    );
    // 상대 경로는 그대로
    assert_eq!(rewrite_location("/relative", "https://api.test", 9091), "/relative");
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop/src-tauri && cargo test proxy_server`
Expected: 컴파일 에러 — `rewrite_set_cookie`/`rewrite_location` 미정의

- [ ] **Step 3: 구현**

`build_forward_url` 아래에 추가:

```rust
/// Set-Cookie 값을 localhost 프록시용으로 재작성.
/// Domain 제거(타깃 도메인 쿠키는 localhost 응답에서 거부됨),
/// Secure 제거(http://localhost), SameSite=None 제거(None은 Secure 필수라 충돌).
pub fn rewrite_set_cookie(value: &str) -> String {
    value
        .split(';')
        .map(|s| s.trim())
        .filter(|s| {
            let lower = s.to_ascii_lowercase();
            !(lower.starts_with("domain=") || lower == "secure" || lower == "samesite=none")
        })
        .collect::<Vec<_>>()
        .join("; ")
}

/// Location이 타깃 base로 시작하면 프록시 주소로 재작성(내부 리다이렉트가 프록시를 벗어나지 않게).
/// 상대 경로·다른 호스트는 그대로 둔다.
pub fn rewrite_location(value: &str, target_base: &str, bound_port: u16) -> String {
    let base = target_base.trim_end_matches('/');
    match value.strip_prefix(base) {
        Some(rest) if rest.is_empty() || rest.starts_with('/') || rest.starts_with('?') => {
            format!("http://localhost:{bound_port}{rest}")
        }
        _ => value.to_string(),
    }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/desktop/src-tauri && cargo test proxy_server`
Expected: PASS (기존 + 신규)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/proxy_server.rs
git commit -m "기능: 프록시 Set-Cookie/Location 재작성 헬퍼 (localhost 쿠키·내부 리다이렉트 유지)"
```

---

### Task 7: D — proxy_start 네트워크 설정 + 포워딩 클라이언트 빌더 (Rust)

**Files:**
- Modify: `apps/desktop/src-tauri/src/proxy_server.rs`

- [ ] **Step 1: 실패하는 테스트 작성**

`mod tests`에 추가:

```rust
#[test]
fn forward_client_builds_with_options() {
    assert!(build_forward_client(true, None, 5_000).is_ok());
    assert!(build_forward_client(false, Some("http://127.0.0.1:8888"), 5_000).is_ok());
    assert!(build_forward_client(false, Some("::이상한값::"), 5_000).is_err());
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop/src-tauri && cargo test proxy_server`
Expected: 컴파일 에러 — `build_forward_client` 미정의

- [ ] **Step 3: 구현**

빌더 함수 추가:

```rust
/// 포워딩용 reqwest 클라이언트. 리다이렉트는 추적하지 않는다(클라이언트가 302를 직접 보게).
/// insecure=true면 TLS 검증을 끈다(사내망 MITM CA 대응 — 앱 설정의 'SSL 검증 끄기'와 동일).
fn build_forward_client(
    insecure: bool,
    proxy: Option<&str>,
    timeout_ms: u64,
) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_millis(timeout_ms));
    if insecure {
        builder = builder.danger_accept_invalid_certs(true);
    }
    if let Some(p) = proxy.filter(|s| !s.trim().is_empty()) {
        builder = builder.proxy(reqwest::Proxy::all(p).map_err(|e| format!("프록시 설정 오류: {e}"))?);
    }
    builder.build().map_err(|e| e.to_string())
}
```

`ProxyState`에 `bound_port` 추가:

```rust
#[derive(Clone)]
struct ProxyState {
    target: Arc<String>,
    client: reqwest::Client,
    bound_port: u16,
}
```

`proxy_start` 시그니처·본문 교체(state 구성을 bind 이후로 이동):

```rust
#[tauri::command]
pub async fn proxy_start(
    target_base_url: String,
    port: u16,
    insecure: Option<bool>,
    proxy: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<u16, String> {
    stop_proxy_internal();
    if target_base_url.trim().is_empty() {
        return Err("타깃 Base URL이 비어 있습니다".into());
    }
    let client = build_forward_client(
        insecure.unwrap_or(false),
        proxy.as_deref(),
        timeout_ms.unwrap_or(30_000),
    )?;
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .map_err(|e| format!("PORT_IN_USE: {e}"))?;
    let bound = listener.local_addr().map_err(|e| e.to_string())?.port();
    let (tx, rx) = oneshot::channel::<()>();
    let state = ProxyState {
        target: Arc::new(target_base_url),
        client,
        bound_port: bound,
    };
    let app = Router::new().fallback(forward_handler).with_state(state);
    *proxy_handle().lock().unwrap() = Some(RunningProxy {
        shutdown_tx: Some(tx),
        port: bound,
    });
    recordings().lock().unwrap().clear();
    tokio::spawn(async move {
        let serve = axum::serve(listener, app).with_graceful_shutdown(async {
            let _ = rx.await;
        });
        if let Err(e) = serve.await {
            eprintln!("[proxy_server] 오류: {e}");
        }
    });
    Ok(bound)
}
```

기존 테스트 `proxy_preserves_upstream_content_type`의 `ProxyState` 구성에 필드 추가:

```rust
let state = ProxyState {
    target: Arc::new(format!("http://127.0.0.1:{target_port}")),
    client: build_forward_client(false, None, 30_000).unwrap(),
    bound_port: proxy_port,
};
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/desktop/src-tauri && cargo test proxy_server`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/proxy_server.rs
git commit -m "기능: 프록시 포워딩에 네트워크 설정 적용(insecure·프록시·타임아웃) + 리다이렉트 추적 끔"
```

---

### Task 8: D — forward_handler 응답 패스스루 + CORS credentials (Rust, TDD)

**Files:**
- Modify: `apps/desktop/src-tauri/src/proxy_server.rs`

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`mod tests`에 추가:

```rust
/// 쿠키·리다이렉트가 추적 없이 그대로 전달되고(Set-Cookie 재작성), CORS가 Origin echo인지 확인.
#[tokio::test]
async fn proxy_passes_cookies_redirect_and_cors() {
    use axum::routing::get;

    let target_app = Router::new().route(
        "/login",
        get(|| async {
            axum::http::Response::builder()
                .status(302)
                .header("Set-Cookie", "sid=abc; Domain=.api.test; Secure; Path=/; HttpOnly; SameSite=None")
                .header("Set-Cookie", "csrf=xyz; Path=/")
                .header("Location", "/home")
                .body(axum::body::Body::empty())
                .unwrap()
        }),
    );
    let target_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let target_port = target_listener.local_addr().unwrap().port();
    tokio::spawn(async move {
        axum::serve(target_listener, target_app).await.unwrap();
    });

    let proxy_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let proxy_port = proxy_listener.local_addr().unwrap().port();
    let state = ProxyState {
        target: Arc::new(format!("http://127.0.0.1:{target_port}")),
        client: build_forward_client(false, None, 30_000).unwrap(),
        bound_port: proxy_port,
    };
    let proxy_app = Router::new().fallback(forward_handler).with_state(state);
    tokio::spawn(async move {
        axum::serve(proxy_listener, proxy_app).await.unwrap();
    });
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    // 테스트 클라이언트도 리다이렉트를 따라가지 않게 해서 302를 그대로 관찰
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let resp = client
        .get(format!("http://127.0.0.1:{proxy_port}/login"))
        .header("Origin", "http://localhost:5173")
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status().as_u16(), 302, "리다이렉트가 추적되지 않고 그대로 와야 한다");
    let cookies: Vec<String> = resp
        .headers()
        .get_all("set-cookie")
        .iter()
        .map(|v| v.to_str().unwrap().to_string())
        .collect();
    assert_eq!(
        cookies,
        vec!["sid=abc; Path=/; HttpOnly".to_string(), "csrf=xyz; Path=/".to_string()],
        "Set-Cookie 다중 값이 재작성되어 모두 전달돼야 한다"
    );
    assert_eq!(resp.headers().get("location").unwrap(), "/home", "상대 Location은 그대로");
    assert_eq!(
        resp.headers().get("access-control-allow-origin").unwrap(),
        "http://localhost:5173",
        "Origin이 있으면 echo"
    );
    assert_eq!(resp.headers().get("access-control-allow-credentials").unwrap(), "true");
}

/// 절대 URL Location이 타깃 접두사면 프록시 주소로 재작성되는지 확인.
#[tokio::test]
async fn proxy_rewrites_absolute_location_to_proxy() {
    use axum::routing::get;

    let target_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let target_port = target_listener.local_addr().unwrap().port();
    let loc = format!("http://127.0.0.1:{target_port}/next");
    let target_app = Router::new().route(
        "/go",
        get(move || {
            let loc = loc.clone();
            async move {
                axum::http::Response::builder()
                    .status(302)
                    .header("Location", loc)
                    .body(axum::body::Body::empty())
                    .unwrap()
            }
        }),
    );
    tokio::spawn(async move {
        axum::serve(target_listener, target_app).await.unwrap();
    });

    let proxy_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let proxy_port = proxy_listener.local_addr().unwrap().port();
    let state = ProxyState {
        target: Arc::new(format!("http://127.0.0.1:{target_port}")),
        client: build_forward_client(false, None, 30_000).unwrap(),
        bound_port: proxy_port,
    };
    let proxy_app = Router::new().fallback(forward_handler).with_state(state);
    tokio::spawn(async move {
        axum::serve(proxy_listener, proxy_app).await.unwrap();
    });
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let resp = client
        .get(format!("http://127.0.0.1:{proxy_port}/go"))
        .send()
        .await
        .unwrap();
    assert_eq!(
        resp.headers().get("location").unwrap().to_str().unwrap(),
        format!("http://localhost:{proxy_port}/next"),
        "타깃 내부 리다이렉트는 프록시 주소로 재작성"
    );
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop/src-tauri && cargo test proxy_server`
Expected: FAIL — set-cookie/location이 응답에 없음(현재는 Content-Type만 보존)

- [ ] **Step 3: 핸들러 구현**

`cors_headers`를 Origin echo 버전으로 교체:

```rust
/// Origin이 있으면 echo + credentials 허용(쿠키 포함 요청), 없으면 "*".
fn cors_headers(resp: &mut axum::http::HeaderMap, origin: Option<&axum::http::HeaderValue>) {
    match origin {
        Some(o) => {
            resp.insert("Access-Control-Allow-Origin", o.clone());
            resp.insert("Access-Control-Allow-Credentials", "true".parse().unwrap());
            resp.insert("Vary", "Origin".parse().unwrap());
        }
        None => {
            resp.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
        }
    }
    resp.insert("Access-Control-Allow-Methods", "*".parse().unwrap());
}

/// 클라이언트로 그대로 보내지 않을 응답 헤더.
/// hop-by-hop + 본문 변형으로 무효(content-length/encoding) + CORS는 자체 계산.
fn skip_response_header(name: &str) -> bool {
    matches!(
        name,
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailers"
            | "transfer-encoding"
            | "upgrade"
            | "content-length"
            | "content-encoding"
    ) || name.starts_with("access-control-")
}
```

`forward_handler` 전체 교체:

```rust
async fn forward_handler(
    State(st): State<ProxyState>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> axum::response::Response {
    let origin = headers.get("origin").cloned();

    // OPTIONS preflight: 요청한 헤더를 echo(없으면 *)
    if method == Method::OPTIONS {
        let mut resp = (axum::http::StatusCode::NO_CONTENT).into_response();
        let allow_headers = headers
            .get("access-control-request-headers")
            .cloned()
            .unwrap_or_else(|| "*".parse().unwrap());
        cors_headers(resp.headers_mut(), origin.as_ref());
        resp.headers_mut().insert("Access-Control-Allow-Headers", allow_headers);
        return resp;
    }

    let path = uri.path().to_string();
    let url = build_forward_url(&st.target, &path, uri.query());

    let rmethod =
        reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET);
    let mut req = st.client.request(rmethod, &url).body(body.to_vec());
    // host 제외(타깃이 자기 호스트를 받도록), accept-encoding 제외(본문을 text로 다루므로
    // reqwest가 직접 gzip을 협상·해제하게 둔다 — 클라이언트 값(br/zstd)을 넘기면 본문이 깨진다)
    for (k, v) in headers.iter() {
        let name = k.as_str();
        if name.eq_ignore_ascii_case("host") || name.eq_ignore_ascii_case("accept-encoding") {
            continue;
        }
        if let Ok(val) = v.to_str() {
            req = req.header(name, val);
        }
    }

    match req.send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            // 본문 소비 전에 패스스루 응답 헤더를 수집·재작성.
            // is_append: Set-Cookie만 다중 값이라 append, 나머지는 insert(axum 기본 Content-Type 대체).
            let mut passthrough: Vec<(String, String, bool)> = Vec::new();
            for (k, v) in res.headers() {
                let name = k.as_str(); // reqwest는 소문자 보장
                if skip_response_header(name) {
                    continue;
                }
                let Ok(val) = v.to_str() else { continue };
                match name {
                    "set-cookie" => passthrough.push((name.into(), rewrite_set_cookie(val), true)),
                    "location" => passthrough.push((
                        name.into(),
                        rewrite_location(val, &st.target, st.bound_port),
                        false,
                    )),
                    _ => passthrough.push((name.into(), val.to_string(), false)),
                }
            }
            // 주의: 바이너리/비-UTF8 응답은 text() 디코딩 시 손실될 수 있다.
            let resp_body = res.text().await.unwrap_or_default();
            push_record(ProxyRecord {
                at_ms: now_ms(),
                method: method.to_string(),
                path: path.clone(),
                status,
                response_body: resp_body.clone(),
                error: None,
            });
            let mut resp = (
                axum::http::StatusCode::from_u16(status)
                    .unwrap_or(axum::http::StatusCode::OK),
                resp_body,
            )
                .into_response();
            for (name, val, is_append) in passthrough {
                let Ok(n) = axum::http::HeaderName::from_bytes(name.as_bytes()) else { continue };
                let Ok(v) = val.parse::<axum::http::HeaderValue>() else { continue };
                if is_append {
                    resp.headers_mut().append(n, v);
                } else {
                    resp.headers_mut().insert(n, v);
                }
            }
            cors_headers(resp.headers_mut(), origin.as_ref());
            resp
        }
        Err(e) => {
            push_record(ProxyRecord {
                at_ms: now_ms(),
                method: method.to_string(),
                path,
                status: 502,
                response_body: String::new(),
                error: Some(e.to_string()),
            });
            let mut resp = (
                axum::http::StatusCode::BAD_GATEWAY,
                format!("프록시 포워딩 실패: {e}"),
            )
                .into_response();
            cors_headers(resp.headers_mut(), origin.as_ref());
            resp
        }
    }
}
```

기존의 "업스트림 Content-Type 덮어쓰기" 블록(`upstream_ct` 캡처·삽입)은 패스스루가 대체하므로 제거된 상태여야 한다.

- [ ] **Step 4: 통과 확인**

Run: `cd apps/desktop/src-tauri && cargo test proxy_server`
Expected: PASS — 신규 2개 + 기존 `proxy_preserves_upstream_content_type`(content-type이 이제 패스스루로 보존)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/proxy_server.rs
git commit -m "기능: 프록시 응답 헤더 패스스루(Set-Cookie·Location 재작성) + CORS credentials — Okta 등 쿠키/리다이렉트 인증 대응"
```

---

### Task 9: D — 프런트 배선 (startProxy 네트워크 설정 전달, TDD)

**Files:**
- Modify: `apps/desktop/src/core/proxy-client.ts`
- Modify: `apps/desktop/src/components/ProxyModal.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Test: `apps/desktop/src/components/ProxyModal.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`ProxyModal.test.tsx`에 추가:

```tsx
it("net 설정(insecure/proxy/timeout)을 proxy_start에 전달한다", async () => {
  render(
    <ProxyModal
      defaultTarget="https://api.example.com"
      net={{ insecure: true, proxy: "http://proxy:8888", timeoutMs: 5000 }}
      onSendToMock={vi.fn()}
      onSendAllToMock={vi.fn(() => "")}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "시작" }));
  await waitFor(() =>
    expect(invokeMock).toHaveBeenCalledWith(
      "proxy_start",
      expect.objectContaining({ insecure: true, proxy: "http://proxy:8888", timeoutMs: 5000 }),
    ),
  );
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/components/ProxyModal.test.tsx`
Expected: FAIL — net prop 없음(TS)

- [ ] **Step 3: 구현**

`proxy-client.ts`의 `startProxy` 교체:

```ts
import type { NetworkSettings } from "./types";

/** 프록시 시작. 바인딩된 포트 반환. 포트 충돌 시 "PORT_IN_USE: ..." throw.
 *  net: 앱 네트워크 설정 — 포워딩 클라이언트의 TLS 검증/아웃바운드 프록시/타임아웃에 적용. */
export async function startProxy(
  targetBaseUrl: string,
  port: number,
  net?: Partial<NetworkSettings>,
): Promise<number> {
  return invoke<number>("proxy_start", {
    targetBaseUrl,
    port,
    insecure: net?.insecure ?? false,
    proxy: net?.proxy || undefined,
    timeoutMs: net?.timeoutMs ?? 30_000,
  });
}
```

`ProxyModal.tsx` Props에 추가하고 시그니처·호출에 반영:

```ts
import type { NetworkSettings } from "../core/types";
// Props에:
  /** 앱 네트워크 설정(SSL 검증 끄기 등) — 포워딩에 적용 */
  net?: Partial<NetworkSettings>;
// 시그니처:
export function ProxyModal({ defaultTarget, net, onSendToMock, onSendAllToMock, onClose }: Props) {
// toggle 내 시작 호출:
const bp = await startProxy(target, port, net);
```

`App.tsx` ProxyModal 렌더에 prop 추가:

```tsx
net={netSettings}
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/components/ProxyModal.test.tsx && npm run typecheck`
Expected: PASS / 타입 오류 0

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/core/proxy-client.ts apps/desktop/src/components/ProxyModal.tsx apps/desktop/src/components/ProxyModal.test.tsx apps/desktop/src/App.tsx
git commit -m "기능: 프록시 시작 시 네트워크 설정 전달 — 사내망(SSL 검증 끄기) https 타깃 502 해결"
```

---

### Task 10: 마무리 검증

- [ ] **Step 1: 전체 테스트·린트·타입체크**

Run: `cd apps/desktop && npm test && npm run lint && npm run typecheck && cd src-tauri && cargo test`
Expected: 전부 PASS, 린트·타입 오류 0

- [ ] **Step 2: 수동 검증 (설계 문서의 확정 항목)**

`npm run tauri dev`로 앱 실행 후:

1. baseURL을 `https://…`로 바꾸고 앱 재시작 → **유지되는지** 확인 (C)
2. ↺ 리셋 버튼 → 스펙 계산값으로 복원되는지 확인 (C)
3. 프록시 시작 → 여러 요청 녹화 → "전체 Mock으로" → Mock 서버 모달에서 데이터 반영 확인 (A)
4. 컬렉션에서 ✏️로 URL 수정 / 불러오기→수정→"불러온 요청에 덮어쓰기" 동작 확인 (B)
5. (사내망에서) 설정의 SSL 검증 끄기 켠 뒤 https 타깃으로 프록시 시작 → 502가 사라지는지 확인 (D)

- [ ] **Step 3: 남은 변경이 있으면 커밋**

```bash
git status   # 누락 파일 확인 후 커밋
```
