# Mock 프리셋 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 Mock 설정을 이름(제목) 붙여 여러 개 저장·선택(프리셋)하고, 프록시 "전체 Mock으로" 저장 시 제목을 받아 새 프리셋으로 저장한다.

**Architecture:** `mock-config.ts`에 프리셋 CRUD + 머지 순수 함수를 추가하고(스펙별 `swaggerman.mock.presets.${specUrl}`), MockServerModal에 프리셋 바, ProxyModal에 제목 입력, App에 프리셋 생성 핸들러를 붙인다. Rust mock 서버는 변경 없음(활성 config에서 라우트 생성하는 기존 경로 그대로).

**Tech Stack:** React + TypeScript, vitest(+jsdom), localStorage(loadJSON/saveJSON).

**스펙:** `docs/superpowers/specs/2026-06-10-mock-presets-design.md`

**참고 — 기존 코드:**
- `apps/desktop/src/core/mock-config.ts` — `MockOperationConfig`(15-26행), `MockServerConfig`(29-32행), `loadMockConfig`(144), `saveMockConfig`(171), `defaultOpConfig`(112)
- `apps/desktop/src/core/mock-config.test.ts` — `makeOp`/`makeSpec` 픽스처, jsdom+localStorage
- `apps/desktop/src/core/storage.ts` — `loadJSON<T>(key, fallback)`, `saveJSON(key, value)` (remove 없음 → 필터한 배열을 saveJSON)
- `apps/desktop/src/core/proxy-to-mock.ts` — `recordingsToMocks(spec, records, baseUrl?)`, `applyMockTargets(cfg, targets)`
- `apps/desktop/src/App.tsx` — `sendRecordingToMock`(262), `sendAllRecordingsToMock`(274), ProxyModal 마운트(1735~)
- `apps/desktop/src/components/MockServerModal.tsx` — 제어 바(391-414행), config state(75), 자동저장(96-99)
- `apps/desktop/src/components/ProxyModal.tsx` — `onSendAllToMock`(17), "전체 Mock으로" 버튼(102~)
- `apps/desktop/src/components/icons.tsx` — `TrashIcon`, `EditIcon`

**명령어:** `cd apps/desktop && npx vitest run <file>` / `npm test` / `npm run typecheck` / `npm run lint`

**커밋 trailer(모든 커밋):**
```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| Modify `src/core/mock-config.ts` | `MockPreset` 타입 + CRUD(load/save/delete/rename) + `applyPresetToConfig` |
| Modify `src/core/mock-config.test.ts` | 프리셋 함수 단위 테스트 |
| Modify `src/App.tsx` | `sendAllRecordingsToMock(records, title)` → 새 프리셋 저장 |
| Modify `src/components/ProxyModal.tsx` + test | "전체 Mock으로" 제목 입력 + 콜백 시그니처 |
| Modify `src/components/MockServerModal.tsx` + test | 프리셋 바 UI |
| Modify `src/App.css` | 프리셋 바 스타일 |

---

### Task 1: mock-config — MockPreset 타입 + CRUD + applyPresetToConfig

**Files:**
- Modify: `apps/desktop/src/core/mock-config.ts`
- Modify: `apps/desktop/src/core/mock-config.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가** (mock-config.test.ts 끝에 — 기존 `makeOp`/`makeSpec` 픽스처 재사용)

```ts
describe("Mock 프리셋", () => {
  beforeEach(() => localStorage.clear());
  const url = "https://api.test/spec.json";

  function ops(): MockOperationConfig[] {
    return [
      { opId: "GET /items", enabled: true, source: "manual", status: 200, delayMs: 0, itemCount: 20, seed: 1, dataset: [{ id: 1 }] },
      { opId: "GET /pets", enabled: false, source: "schema", status: 200, delayMs: 0, itemCount: 20, seed: 1 },
    ];
  }

  it("loadPresets는 없으면 빈 배열", () => {
    expect(loadPresets(url)).toEqual([]);
  });

  it("savePreset은 id·savedAt을 부여하고 맨 앞에 추가한다", () => {
    const a = savePreset(url, "첫째", ops());
    const b = savePreset(url, "둘째", ops());
    expect(a.id).toBeTruthy();
    expect(a.savedAt).toBeGreaterThan(0);
    expect(a.title).toBe("첫째");
    const list = loadPresets(url);
    expect(list.map((p) => p.title)).toEqual(["둘째", "첫째"]); // 최신 우선
    expect(list[1].id).toBe(a.id);
    expect(b.operations).toHaveLength(2);
  });

  it("deletePreset은 해당 id만 제거한다", () => {
    const a = savePreset(url, "a", ops());
    const b = savePreset(url, "b", ops());
    deletePreset(url, a.id);
    expect(loadPresets(url).map((p) => p.id)).toEqual([b.id]);
  });

  it("renamePreset은 제목만 바꾼다", () => {
    const a = savePreset(url, "old", ops());
    renamePreset(url, a.id, "new");
    expect(loadPresets(url)[0].title).toBe("new");
    expect(loadPresets(url)[0].id).toBe(a.id);
  });

  it("applyPresetToConfig는 config에 있는 opId만 프리셋 값으로 교체하고 port·미존재는 유지한다", () => {
    const spec = makeSpec([makeOp({ id: "GET /items" }), makeOp({ id: "GET /pets", path: "/pets" })]);
    const config: MockServerConfig = { port: 9099, operations: defaultMockConfig(spec).operations };
    const preset = savePreset(url, "p", [
      { opId: "GET /items", enabled: false, source: "manual", status: 404, delayMs: 5, itemCount: 3, seed: 2, body: { x: 1 } },
      { opId: "GET /gone", enabled: true, source: "manual", status: 200, delayMs: 0, itemCount: 20, seed: 1 }, // 스펙에 없음 → 무시
    ]);
    const out = applyPresetToConfig(config, preset);
    expect(out.port).toBe(9099); // port 유지
    const items = out.operations.find((o) => o.opId === "GET /items")!;
    expect(items.status).toBe(404); // 프리셋 값 반영
    expect(items.body).toEqual({ x: 1 });
    const pets = out.operations.find((o) => o.opId === "GET /pets")!;
    expect(pets.enabled).toBe(true); // 프리셋에 없으니 config 기존값 유지
    expect(out.operations.some((o) => o.opId === "GET /gone")).toBe(false); // 미존재 opId 무시
    expect(config.operations.find((o) => o.opId === "GET /items")!.status).toBe(200); // 원본 불변
  });
});
```

import 줄에 추가: `loadPresets, savePreset, deletePreset, renamePreset, applyPresetToConfig` 와 타입 `MockPreset, MockOperationConfig`. (makeSpec이 test에 없으면 기존 픽스처 패턴대로 정의 — 기존 테스트가 spec 만드는 방식 따름.)

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/core/mock-config.test.ts`
Expected: FAIL — `loadPresets` 등 export 없음

- [ ] **Step 3: 구현** (mock-config.ts — `MockServerConfig` 타입 아래에 타입 추가, 공개 함수 영역에 함수 추가)

타입(파일 상단, MockServerConfig 다음):
```ts
/** 이름 붙인 Mock 설정 스냅샷 */
export interface MockPreset {
  id: string;
  title: string;
  savedAt: number;
  operations: MockOperationConfig[];
}
```

상수(STORAGE_KEY_PREFIX 옆):
```ts
const PRESETS_KEY_PREFIX = "swaggerman.mock.presets.";
```

함수(파일 끝, 공개 함수 영역):
```ts
/** 스펙별 저장된 Mock 프리셋 목록(최신 우선). 없으면 빈 배열. */
export function loadPresets(specUrl: string): MockPreset[] {
  return loadJSON<MockPreset[]>(`${PRESETS_KEY_PREFIX}${specUrl}`, []);
}

/** 현재 operations를 제목 붙인 프리셋으로 저장(맨 앞에 추가). 생성된 프리셋 반환. */
export function savePreset(specUrl: string, title: string, operations: MockOperationConfig[]): MockPreset {
  const preset: MockPreset = {
    id: crypto.randomUUID(),
    title,
    savedAt: Date.now(),
    operations: structuredClone(operations),
  };
  const list = [preset, ...loadPresets(specUrl)];
  saveJSON(`${PRESETS_KEY_PREFIX}${specUrl}`, list);
  return preset;
}

/** 프리셋 삭제. */
export function deletePreset(specUrl: string, id: string): void {
  const list = loadPresets(specUrl).filter((p) => p.id !== id);
  saveJSON(`${PRESETS_KEY_PREFIX}${specUrl}`, list);
}

/** 프리셋 제목 변경. */
export function renamePreset(specUrl: string, id: string, title: string): void {
  const list = loadPresets(specUrl).map((p) => (p.id === id ? { ...p, title } : p));
  saveJSON(`${PRESETS_KEY_PREFIX}${specUrl}`, list);
}

/**
 * 프리셋을 config에 적용한 새 config를 반환(불변).
 * - port는 config 유지
 * - operations: config에 있는 opId만 순회, 같은 opId가 프리셋에 있으면 프리셋 값으로 교체,
 *   없으면 config 기존값 유지. 스펙(=config)에 없는 프리셋 opId는 무시.
 */
export function applyPresetToConfig(config: MockServerConfig, preset: MockPreset): MockServerConfig {
  const presetMap = new Map(preset.operations.map((o) => [o.opId, o]));
  return {
    port: config.port,
    operations: config.operations.map((o) => presetMap.get(o.opId) ?? o),
  };
}
```

(`loadJSON`/`saveJSON`는 이미 import됨 — 확인만.)

- [ ] **Step 4: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/core/mock-config.test.ts`
Expected: 기존 + 신규 전체 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/core/mock-config.ts apps/desktop/src/core/mock-config.test.ts
git commit -m "기능: Mock 프리셋 CRUD + applyPresetToConfig — 스펙별 이름 붙인 설정 스냅샷"
```

---

### Task 2: App — sendAllRecordingsToMock(records, title)로 새 프리셋 저장

**Files:**
- Modify: `apps/desktop/src/App.tsx` (`sendAllRecordingsToMock` ~274행)

- [ ] **Step 1: 구현** (시그니처에 title 추가, 새 프리셋 저장으로 변경)

```ts
  // 프록시 녹화 전체를 제목 붙인 새 Mock 프리셋으로 저장(활성 config는 건드리지 않음).
  function sendAllRecordingsToMock(records: ProxyRecord[], title: string): string {
    if (!spec) return "스펙이 로드되지 않았습니다";
    const { targets, unmatched, failed } = recordingsToMocks(spec, records, baseURL);
    if (targets.length === 0) return "저장할 녹화가 없습니다(스펙에 없는 경로거나 실패한 녹화)";
    const url = activeSpecUrl || specUrl;
    const base = loadMockConfig(url, spec);
    applyMockTargets(base, targets);
    savePreset(url, title, base.operations);
    const parts = [`프리셋 '${title}' 저장 ${targets.length}건`];
    if (unmatched > 0) parts.push(`스펙에 없는 경로 ${unmatched}건 제외`);
    if (failed > 0) parts.push(`실패 녹화 ${failed}건 제외`);
    return parts.join(", ");
  }
```

import 추가(App.tsx 상단 mock-config import 또는 신규): `savePreset`, `loadMockConfig` (loadMockConfig는 이미 import됐는지 확인 — 없으면 추가). `saveMockConfig` 호출은 제거됨(활성 config 불변).

- [ ] **Step 2: 타입 확인** (ProxyModal Props 변경 전이라 App에서 prop 전달부는 Task 3에서 함께 맞춤)

Run: `cd apps/desktop && npm run typecheck`
Expected: ProxyModal `onSendAllToMock` 타입 불일치가 날 수 있음 — Task 3에서 Props 시그니처를 맞추면 해소. 이 시점에 에러가 나면 Task 3까지 진행 후 함께 typecheck.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/App.tsx
git commit -m "기능: 프록시 전체저장을 제목 붙인 새 Mock 프리셋으로 — 활성 config 불변"
```

---

### Task 3: ProxyModal — "전체 Mock으로" 제목 입력

**Files:**
- Modify: `apps/desktop/src/components/ProxyModal.tsx`
- Modify: `apps/desktop/src/components/ProxyModal.test.tsx`

- [ ] **Step 1: 실패하는 테스트 추가** (ProxyModal.test.tsx — 기존 "전체 Mock으로" 테스트를 제목 입력 흐름으로 보강. 기존 테스트가 깨지면 함께 수정)

```ts
describe("ProxyModal 전체 Mock으로 제목", () => {
  it("'전체 Mock으로' 클릭 시 제목 입력이 뜨고, 제목 저장 시 records와 title을 넘긴다", async () => {
    const recs: ProxyRecord[] = [
      { atMs: 1, method: "GET", path: "/pet", status: 200, responseBody: "[]" },
    ];
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "proxy_start") return 9091;
      if (cmd === "proxy_recordings") return recs;
      return undefined;
    });
    const onSendAll = vi.fn(() => "프리셋 'smoke' 저장 1건");
    render(
      <ProxyModal defaultTarget="https://api.example.com"
        onSendToMock={vi.fn()} onSendAllToMock={onSendAll} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    fireEvent.click(await screen.findByRole("button", { name: "전체 Mock으로" }));
    // 제목 입력 노출
    const input = await screen.findByPlaceholderText("프리셋 제목");
    fireEvent.change(input, { target: { value: "smoke" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(onSendAll).toHaveBeenCalledWith(recs, "smoke");
    expect(screen.getByText("프리셋 'smoke' 저장 1건")).toBeTruthy();
  });

  it("제목이 비면 저장 버튼이 비활성", async () => {
    const recs: ProxyRecord[] = [{ atMs: 1, method: "GET", path: "/pet", status: 200, responseBody: "[]" }];
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "proxy_start") return 9091;
      if (cmd === "proxy_recordings") return recs;
      return undefined;
    });
    render(<ProxyModal defaultTarget="https://api.example.com"
      onSendToMock={vi.fn()} onSendAllToMock={vi.fn(() => "")} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    fireEvent.click(await screen.findByRole("button", { name: "전체 Mock으로" }));
    expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
```

또한 기존 테스트 "'전체 Mock으로' 클릭 시 녹화 전체를 넘기고…"가 있으면, 새 흐름(제목 입력 후 저장)에 맞게 수정하거나 제거(중복). 기존 `onSendAllToMock` mock 호출 인자가 `(recs)`였다면 `(recs, "제목")`으로.

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/components/ProxyModal.test.tsx`
Expected: 신규 FAIL(제목 입력 UI 없음)

- [ ] **Step 3: 구현** (ProxyModal.tsx)

Props 시그니처 변경:
```tsx
  onSendAllToMock: (records: ProxyRecord[], title: string) => string;
```

상태 추가(다른 useState 근처):
```tsx
  const [bulkTitle, setBulkTitle] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
```

"전체 Mock으로" 영역(기존 `proxy-bulk-row`) 교체:
```tsx
            {shownRecords.length > 0 && (
              <div className="proxy-bulk-row">
                {!bulkOpen ? (
                  <button className="btn small" onClick={() => { setBulkOpen(true); setBulkTitle(""); }}>
                    전체 Mock으로
                  </button>
                ) : (
                  <>
                    <input className="proxy-bulk-title" value={bulkTitle} autoFocus
                      placeholder="프리셋 제목" onChange={(e) => setBulkTitle(e.target.value)} />
                    <button className="btn small primary" disabled={!bulkTitle.trim()}
                      onClick={() => { setSendMsg(onSendAllToMock(shownRecords, bulkTitle.trim())); setBulkOpen(false); }}>
                      저장
                    </button>
                    <button className="btn small" onClick={() => setBulkOpen(false)}>취소</button>
                  </>
                )}
              </div>
            )}
```

- [ ] **Step 4: App의 prop 전달 확인** — App.tsx ProxyModal 마운트의 `onSendAllToMock={sendAllRecordingsToMock}`는 시그니처가 이미 `(records, title)`이라 그대로 동작. 추가 변경 없음.

- [ ] **Step 5: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/components/ProxyModal.test.tsx && npm run typecheck`
Expected: 전체 PASS, typecheck 클린(Task 2의 타입 불일치도 해소)

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/ProxyModal.tsx apps/desktop/src/components/ProxyModal.test.tsx
git commit -m "기능: 프록시 '전체 Mock으로'에 프리셋 제목 입력 — 콜백에 title 전달"
```

---

### Task 4: MockServerModal — 프리셋 바 UI

**Files:**
- Modify: `apps/desktop/src/components/MockServerModal.tsx`
- Modify: `apps/desktop/src/components/MockServerModal.test.tsx`
- Modify: `apps/desktop/src/App.css`

- [ ] **Step 1: 실패하는 테스트 추가** (MockServerModal.test.tsx — 기존 mock invoke 패턴 따름)

```ts
describe("MockServerModal 프리셋", () => {
  it("'현재 설정 저장'으로 제목을 넣으면 드롭다운에 프리셋이 나타난다", async () => {
    renderModal(); // 기존 헬퍼 사용(없으면 기존 테스트의 render 패턴 복제)
    fireEvent.click(screen.getByRole("button", { name: "현재 설정 저장" }));
    const input = await screen.findByPlaceholderText("프리셋 제목");
    fireEvent.change(input, { target: { value: "기본세트" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    // 드롭다운(select)에 옵션으로 노출
    expect(await screen.findByRole("option", { name: /기본세트/ })).toBeTruthy();
  });

  it("프리셋 선택 시 confirm 후 설정에 적용한다", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "현재 설정 저장" }));
    fireEvent.change(await screen.findByPlaceholderText("프리셋 제목"), { target: { value: "세트A" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    const select = await screen.findByRole("combobox");
    const option = await screen.findByRole("option", { name: /세트A/ }) as HTMLOptionElement;
    fireEvent.change(select, { target: { value: option.value } });
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
```

(주의: `renderModal` 헬퍼가 기존 테스트에 있으면 재사용, 없으면 기존 `render(<MockServerModal … />)` 패턴을 그대로 복제. spec/specUrl/history props는 기존 테스트와 동일하게.)

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/components/MockServerModal.test.tsx`
Expected: FAIL("현재 설정 저장" 버튼 없음)

- [ ] **Step 3: 구현** (MockServerModal.tsx)

import 추가:
```tsx
import { loadPresets, savePreset, deletePreset, renamePreset, applyPresetToConfig, type MockPreset } from "../core/mock-config";
import { TrashIcon, EditIcon } from "./icons";
```
(이미 import된 심볼은 중복 추가하지 않음)

상태 추가(config state 근처):
```tsx
  const [presets, setPresets] = useState<MockPreset[]>(() => loadPresets(specUrl));
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetTitle, setPresetTitle] = useState("");
```

핸들러(컴포넌트 내부, return 위):
```tsx
  const refreshPresets = () => setPresets(loadPresets(specUrl));

  const handleSavePreset = () => {
    const t = presetTitle.trim();
    if (!t) return;
    savePreset(specUrl, t, config.operations);
    setSaveOpen(false);
    setPresetTitle("");
    refreshPresets();
  };

  const handleSelectPreset = (id: string) => {
    if (!id) return;
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    if (!window.confirm(`현재 Mock 설정을 '${preset.title}' 프리셋으로 덮어씁니다. 계속할까요?`)) return;
    setConfig((prev) => applyPresetToConfig(prev, preset));
    setSelectedPresetId(id);
  };

  const handleDeletePreset = () => {
    const preset = presets.find((p) => p.id === selectedPresetId);
    if (!preset) return;
    if (!window.confirm(`프리셋 '${preset.title}'을(를) 삭제할까요?`)) return;
    deletePreset(specUrl, preset.id);
    setSelectedPresetId("");
    refreshPresets();
  };

  const handleRenamePreset = () => {
    const preset = presets.find((p) => p.id === selectedPresetId);
    if (!preset) return;
    const next = window.prompt("새 제목", preset.title);
    if (next && next.trim()) {
      renamePreset(specUrl, preset.id, next.trim());
      refreshPresets();
    }
  };
```

제어 바(`mock-control-bar`) 아래에 프리셋 바 추가:
```tsx
        {/* ── 프리셋 바 ── */}
        <div className="mock-preset-bar">
          {presets.length > 0 ? (
            <select className="mock-preset-select" value={selectedPresetId}
              onChange={(e) => handleSelectPreset(e.target.value)}>
              <option value="">프리셋 불러오기…</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} · {new Date(p.savedAt).toLocaleString()}
                </option>
              ))}
            </select>
          ) : (
            <span className="hint">저장된 프리셋 없음</span>
          )}
          {selectedPresetId && (
            <>
              <button className="icon-btn" title="이름변경" onClick={handleRenamePreset}><EditIcon size={14} /></button>
              <button className="icon-btn" title="삭제" onClick={handleDeletePreset}><TrashIcon size={14} /></button>
            </>
          )}
          {!saveOpen ? (
            <button className="btn small" onClick={() => { setSaveOpen(true); setPresetTitle(""); }}>현재 설정 저장</button>
          ) : (
            <>
              <input className="mock-preset-title" value={presetTitle} autoFocus
                placeholder="프리셋 제목" onChange={(e) => setPresetTitle(e.target.value)} />
              <button className="btn small primary" disabled={!presetTitle.trim()} onClick={handleSavePreset}>저장</button>
              <button className="btn small" onClick={() => setSaveOpen(false)}>취소</button>
            </>
          )}
        </div>
```

- [ ] **Step 4: App.css에 스타일 추가** (`.mock-control-bar` 근처)

```css
.mock-preset-bar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; flex-wrap: wrap; }
.mock-preset-select, .mock-preset-title, .proxy-bulk-title {
  background: var(--input-bg, #0d1117); color: inherit;
  border: 1px solid var(--border, #30363d); border-radius: 6px; padding: 4px 8px; font-size: 13px;
}
.mock-preset-select { min-width: 200px; }
```

(주의: 기존 CSS 변수명을 확인해 맞추되, 없으면 위 폴백값으로. `.hint`가 이미 정의돼 있으면 재사용.)

- [ ] **Step 5: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/components/MockServerModal.test.tsx`
Expected: 기존 + 신규 전체 PASS

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/MockServerModal.tsx apps/desktop/src/components/MockServerModal.test.tsx apps/desktop/src/App.css
git commit -m "기능: MockServerModal 프리셋 바 — 저장·드롭다운 불러오기(확인)·이름변경·삭제"
```

---

### Task 5: 전체 검증

- [ ] **Step 1: 전체 테스트·타입·린트·빌드**

Run: `cd apps/desktop && npm test && npm run typecheck && npm run lint && npm run build`
Expected: vitest 전체 PASS, typecheck 0 에러, lint 0 에러(기존 AiPanel 경고만), 빌드 성공

- [ ] **Step 2: 실패 시** — 실패한 테스트의 실제 출력을 읽고 원인 수정 후 재실행. **모두 통과할 때까지 반복**(사용자 지시).

- [ ] **Step 3: Commit**(검증 중 수정이 있었으면)

```bash
git add -A && git commit -m "검증: Mock 프리셋 전체 테스트·타입·린트 통과 확인"
```

---

## Self-Review 결과

- **스펙 커버리지**: 데이터모델·CRUD·applyPresetToConfig(T1), 프록시 새 프리셋 저장(T2), 프록시 제목 입력 UI(T3), Mock 모달 프리셋 바·확인 후 덮어쓰기·삭제/이름변경(T4), 전체 검증(T5). 스펙의 에러 처리 표 5건 모두 구현 위치 존재(빈 제목 비활성 T3·T4, 미존재 opId 무시 T1, 0건 안내 T2, 프리셋 0개 힌트 T4).
- **타입 일관성**: `onSendAllToMock(records, title)` ↔ App `sendAllRecordingsToMock(records, title)` 일치. `MockPreset.operations: MockOperationConfig[]` 재사용. `applyPresetToConfig`는 불변 반환(테스트로 검증).
- **비범위 준수**: Rust mock 서버·import/export·전역 프리셋·단건 Mock으로 프리셋화 모두 제외.
