# API 시간여행 Implementation Plan

> **For agentic workers:** subagent-driven-development / executing-plans. Checkbox steps.

**Goal:** 선택 API 응답을 수동/자동주기로 스냅샷 저장하고, 타임라인 탐색 + 두 스냅샷 비교(CompareModal 재활용)한다.

**Spec:** `docs/superpowers/specs/2026-06-03-time-travel-design.md`

작업 디렉터리 `apps/desktop`, 브랜치 main, 한국어. 재활용: buildRequest/defaultInputs(request-builder), computeSecurityHeaders(security), executeRequest(http-client), CompareModal(a,b: HistoryItem). App에 이미 `compareItems`/`setCompareItems`([HistoryItem,HistoryItem]|null) + CompareModal 렌더 있음.

---

### Task 1: core/snapshots.ts

**Files:** Create `src/core/snapshots.ts`, `src/core/snapshots.test.ts`

- [ ] **Step 1: 테스트**

```ts
// src/core/snapshots.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSnapshots, saveSnapshots, addSnapshot, groupByOp,
  loadTTConfig, saveTTConfig, defaultTTConfig, type Snapshot,
} from "./snapshots";

beforeEach(() => localStorage.clear());
const URL = "https://api.test/s.json";

function snap(opId: string, at: number, over: Partial<Snapshot> = {}): Snapshot {
  return { id: `${opId}-${at}`, opId, at, method: "GET", path: opId.split(" ")[1] ?? "/", status: 200, body: "{}", durationMs: 5, ...over };
}

describe("snapshots 저장/복원", () => {
  it("저장 후 복원", () => {
    saveSnapshots(URL, [snap("GET /a", 1)]);
    expect(loadSnapshots(URL)).toHaveLength(1);
  });
  it("없으면 빈 배열", () => {
    expect(loadSnapshots(URL)).toEqual([]);
  });
});

describe("addSnapshot", () => {
  it("추가하고 200개 cap(오래된 것 drop)", () => {
    let list: Snapshot[] = [];
    for (let i = 0; i < 230; i++) list = addSnapshot(list, snap("GET /a", i));
    expect(list.length).toBe(200);
    expect(list[0].at).toBe(30); // 앞 30개 drop
  });
});

describe("groupByOp", () => {
  it("opId별로 묶고 시간 오름차순 정렬", () => {
    const list = [snap("GET /a", 3), snap("GET /b", 1), snap("GET /a", 1)];
    const g = groupByOp(list);
    expect(g.get("GET /a")!.map((s) => s.at)).toEqual([1, 3]);
    expect(g.get("GET /b")!).toHaveLength(1);
  });
});

describe("TTConfig", () => {
  it("기본값: 빈 opIds, 5분, autoOff", () => {
    const c = defaultTTConfig();
    expect(c.opIds).toEqual([]);
    expect(c.intervalMin).toBe(5);
    expect(c.autoOn).toBe(false);
  });
  it("저장/복원", () => {
    saveTTConfig(URL, { opIds: ["GET /a"], intervalMin: 15, autoOn: true });
    expect(loadTTConfig(URL)).toEqual({ opIds: ["GET /a"], intervalMin: 15, autoOn: true });
  });
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현**

```ts
// src/core/snapshots.ts
// API 응답 스냅샷 저장·조회(시간여행). localStorage 영속(스펙별).
import { loadJSON, saveJSON } from "./storage";

export interface Snapshot {
  id: string;
  opId: string;
  at: number;
  method: string;
  path: string;
  status: number;
  body: string;
  durationMs: number;
}

export interface TimeTravelConfig {
  opIds: string[];
  intervalMin: number;
  autoOn: boolean;
}

const MAX_SNAPSHOTS = 200;

export function defaultTTConfig(): TimeTravelConfig {
  return { opIds: [], intervalMin: 5, autoOn: false };
}

export function loadSnapshots(specUrl: string): Snapshot[] {
  return loadJSON<Snapshot[]>(`swaggerman.snapshots.${specUrl}`, []);
}
export function saveSnapshots(specUrl: string, snaps: Snapshot[]): void {
  saveJSON(`swaggerman.snapshots.${specUrl}`, snaps);
}
export function loadTTConfig(specUrl: string): TimeTravelConfig {
  return loadJSON<TimeTravelConfig>(`swaggerman.ttconfig.${specUrl}`, defaultTTConfig());
}
export function saveTTConfig(specUrl: string, config: TimeTravelConfig): void {
  saveJSON(`swaggerman.ttconfig.${specUrl}`, config);
}

/** 스냅샷 추가(최근 MAX_SNAPSHOTS개 유지). 새 배열 반환. */
export function addSnapshot(list: Snapshot[], snap: Snapshot): Snapshot[] {
  const next = [...list, snap];
  return next.length > MAX_SNAPSHOTS ? next.slice(next.length - MAX_SNAPSHOTS) : next;
}

/** opId별로 묶고 각 그룹을 at 오름차순 정렬. */
export function groupByOp(list: Snapshot[]): Map<string, Snapshot[]> {
  const map = new Map<string, Snapshot[]>();
  for (const s of list) {
    if (!map.has(s.opId)) map.set(s.opId, []);
    map.get(s.opId)!.push(s);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.at - b.at);
  return map;
}
```

- [ ] **Step 4: 통과 + 커밋** `기능: 시간여행 스냅샷 코어 — 저장·cap·opId 그룹화·설정`

---

### Task 2: TimeTravelModal + App 통합

**Files:** Create `src/components/TimeTravelModal.tsx`, `src/components/TimeTravelModal.test.tsx`. Modify `src/App.tsx`, `src/App.css`

- [ ] **Step 1: 모달 테스트**

```tsx
// src/components/TimeTravelModal.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimeTravelModal } from "./TimeTravelModal";
import type { ParsedSpec, ParsedOperation } from "../core/types";
import type { Snapshot } from "../core/snapshots";

const op: ParsedOperation = { id: "GET /pet", method: "GET", path: "/pet", summary: "펫", tags: [], parameters: [], responses: [] };
const spec = { info: { title: "T", version: "1" }, operations: [op], securitySchemes: [] } as unknown as ParsedSpec;
const snaps: Snapshot[] = [
  { id: "s1", opId: "GET /pet", at: 1000, method: "GET", path: "/pet", status: 200, body: "[]", durationMs: 5 },
  { id: "s2", opId: "GET /pet", at: 2000, method: "GET", path: "/pet", status: 500, body: "{}", durationMs: 9 },
];

beforeEach(() => localStorage.clear());

function renderModal(over: Partial<Parameters<typeof TimeTravelModal>[0]> = {}) {
  const onCapture = vi.fn();
  const onCompare = vi.fn();
  render(<TimeTravelModal specUrl="u" spec={spec} snapshots={snaps} onCapture={onCapture} onCompare={onCompare} onClose={vi.fn()} {...over} />);
  return { onCapture, onCompare };
}

describe("TimeTravelModal", () => {
  it("대상 API 체크박스와 '지금 스냅샷' 버튼을 표시한다", () => {
    renderModal();
    expect(screen.getByText("/pet")).toBeTruthy();
    expect(screen.getByRole("button", { name: /지금 스냅샷/ })).toBeTruthy();
  });
  it("타임라인에 스냅샷을 시간순 표시한다", () => {
    renderModal();
    // 상태 200, 500 둘 다 보임
    expect(screen.getAllByText(/200|500/).length).toBeGreaterThanOrEqual(2);
  });
  it("대상 체크 후 '지금 스냅샷'이 onCapture를 호출한다", () => {
    const { onCapture } = renderModal();
    fireEvent.click(screen.getByLabelText("GET /pet 대상")); // 체크박스
    fireEvent.click(screen.getByRole("button", { name: /지금 스냅샷/ }));
    expect(onCapture).toHaveBeenCalledWith(["GET /pet"]);
  });
  it("스냅샷 2개 선택 후 비교가 onCompare를 호출한다", () => {
    const { onCompare } = renderModal();
    const checks = screen.getAllByLabelText(/비교 선택/);
    fireEvent.click(checks[0]);
    fireEvent.click(checks[1]);
    fireEvent.click(screen.getByRole("button", { name: /비교/ }));
    expect(onCompare).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: TimeTravelModal 구현**

```tsx
// src/components/TimeTravelModal.tsx
// API 시간여행: 대상 API를 수동/자동주기로 스냅샷 저장, 타임라인 탐색·비교.
import { useEffect, useMemo, useState } from "react";
import type { ParsedSpec } from "../core/types";
import {
  loadTTConfig, saveTTConfig, groupByOp, type Snapshot, type TimeTravelConfig,
} from "../core/snapshots";
import { Select } from "./Select";
import { methodColor, statusColor } from "./method";
import { CloseCircleIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";

interface Props {
  specUrl: string;
  spec: ParsedSpec;
  snapshots: Snapshot[];
  onCapture: (opIds: string[]) => void;
  onCompare: (a: Snapshot, b: Snapshot) => void;
  onClose: () => void;
}

const INTERVAL_OPTS = [
  { value: "1", label: "1분" }, { value: "5", label: "5분" },
  { value: "15", label: "15분" }, { value: "30", label: "30분" },
];

export function TimeTravelModal({ specUrl, spec, snapshots, onCapture, onCompare, onClose }: Props) {
  useEscToClose(onClose);
  const [config, setConfig] = useState<TimeTravelConfig>(() => loadTTConfig(specUrl));
  const [selectedOp, setSelectedOp] = useState<string | null>(null);
  const [compareSel, setCompareSel] = useState<string[]>([]); // snapshot ids (max 2)

  useEffect(() => { saveTTConfig(specUrl, config); }, [specUrl, config]);

  const grouped = useMemo(() => groupByOp(snapshots), [snapshots]);
  const toggleTarget = (opId: string) =>
    setConfig((c) => ({ ...c, opIds: c.opIds.includes(opId) ? c.opIds.filter((x) => x !== opId) : [...c.opIds, opId] }));

  const toggleCompare = (id: string) =>
    setCompareSel((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev.slice(-1), id].slice(-2));

  const doCompare = () => {
    if (compareSel.length !== 2) return;
    const a = snapshots.find((s) => s.id === compareSel[0]);
    const b = snapshots.find((s) => s.id === compareSel[1]);
    if (a && b) onCompare(a, b);
  };

  const timelineOp = selectedOp ?? config.opIds[0] ?? spec.operations[0]?.id ?? null;
  const timeline = timelineOp ? (grouped.get(timelineOp) ?? []) : [];

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal tt-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>API 시간여행</h3>
          <button className="icon-btn" onClick={onClose} title="닫기"><CloseCircleIcon size={18} /></button>
        </div>
        <div className="modal-body tt-body">
          <div className="tt-control">
            <button className="btn small primary" disabled={config.opIds.length === 0} onClick={() => onCapture(config.opIds)}>
              📸 지금 스냅샷
            </button>
            <label className="tt-auto">
              <input type="checkbox" checked={config.autoOn} onChange={(e) => setConfig((c) => ({ ...c, autoOn: e.target.checked }))} disabled={config.opIds.length === 0} />
              자동
            </label>
            <Select value={String(config.intervalMin)} onChange={(v) => setConfig((c) => ({ ...c, intervalMin: Number(v) }))} options={INTERVAL_OPTS} />
            {config.autoOn && <span className="tt-auto-on">자동 캡처 중 (앱 열린 동안)</span>}
          </div>
          <div className="tt-targets">
            <div className="tt-section">대상 API</div>
            {spec.operations.map((o) => (
              <label className="tt-target-check" key={o.id}>
                <input type="checkbox" aria-label={`${o.id} 대상`} checked={config.opIds.includes(o.id)} onChange={() => toggleTarget(o.id)} />
                <span className="method" style={{ color: methodColor(o.method) }}>{o.method}</span>
                <span className="tt-path">{o.path}</span>
              </label>
            ))}
          </div>
          <div className="tt-timeline-head">
            <span className="tt-section">타임라인</span>
            <Select value={timelineOp ?? ""} onChange={setSelectedOp} options={spec.operations.map((o) => ({ value: o.id, label: `${o.method} ${o.path}` }))} />
            <button className="btn small" disabled={compareSel.length !== 2} onClick={doCompare}>비교 ({compareSel.length}/2)</button>
          </div>
          <div className="tt-timeline">
            {timeline.length === 0 && <div className="hint">기록 없음 — 대상으로 체크하고 스냅샷을 찍으세요</div>}
            {[...timeline].reverse().map((s) => (
              <div className="tt-snap-row" key={s.id}>
                <input type="checkbox" aria-label="비교 선택" checked={compareSel.includes(s.id)} onChange={() => toggleCompare(s.id)} />
                <span className="tt-snap-time">{new Date(s.at).toLocaleString()}</span>
                <span className="tt-snap-status" style={{ color: statusColor(s.status) }}>{s.status || "ERR"}</span>
                <span className="tt-snap-dur">{s.durationMs}ms</span>
                <button className="btn small" onClick={() => setSelectedOp(s.opId) || alert(s.body.slice(0, 4000))}>응답</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

주의: 응답 보기를 `alert`로 두면 테스트/UX가 조잡하다. 대신 인라인 펼침(선택 스냅샷 body를 모달 하단 `<pre>`에 표시)으로 구현하라. `const [viewSnap, setViewSnap] = useState<Snapshot|null>(null)` 추가하고 "응답" 클릭 시 setViewSnap(s), 하단에 `{viewSnap && <pre className="tt-body-view">{viewSnap.body}</pre>}`. (위 alert는 금지 — 인라인 pre로 대체)

- [ ] **Step 4: App.tsx 통합**

import: `import { TimeTravelModal } from "./components/TimeTravelModal";`, snapshots core(loadSnapshots/saveSnapshots/addSnapshot, type Snapshot), `import type { HistoryItem } from "./core/history";`(이미 있음)
state: `const [ttOpen, setTtOpen] = useState(false);`, `const [snapshots, setSnapshots] = useState<Snapshot[]>([]);`
프로젝트 로드 시: `setSnapshots(loadSnapshots(targetUrl));` (loadSpec 블록, favorites 근처)
영속화: `useEffect(() => { if (activeSpecUrl) saveSnapshots(activeSpecUrl, snapshots); }, [snapshots, activeSpecUrl]);`

캡처 콜백:
```tsx
  async function captureSnapshots(opIds: string[]) {
    if (!spec) return;
    for (const opId of opIds) {
      const op = spec.operations.find((o) => o.id === opId);
      if (!op) continue;
      const ins = defaultInputs(op);
      const securityHeaders = computeSecurityHeaders(spec.securitySchemes ?? [], authValues);
      const request = buildRequest(baseURL, op, ins, securityHeaders, globalHeaders, activeVars);
      const t0 = Date.now();
      let snap: Snapshot;
      try {
        const res = await executeRequest(request, netSettings);
        snap = { id: newId(), opId, at: Date.now(), method: op.method, path: op.path, status: res.statusCode, body: res.body, durationMs: res.durationMs };
      } catch (e) {
        snap = { id: newId(), opId, at: Date.now(), method: op.method, path: op.path, status: 0, body: String(e), durationMs: Date.now() - t0 };
      }
      setSnapshots((prev) => addSnapshot(prev, snap));
    }
  }
```
(newId는 core/history에서 이미 import됨. computeSecurityHeaders/authValues/buildRequest/defaultInputs/executeRequest/netSettings/globalHeaders/activeVars 모두 App에 존재)

스냅샷 비교(기존 compareItems 재활용 — Snapshot→HistoryItem 어댑터):
```tsx
  function compareSnapshots(a: Snapshot, b: Snapshot) {
    const toHist = (s: Snapshot): HistoryItem => ({
      id: s.id, opId: s.opId, method: s.method, path: s.path, url: `${baseURL}${s.path}`,
      status: s.status, durationMs: s.durationMs, size: s.body.length, executedAt: s.at,
      inputs: defaultInputs(spec!.operations.find((o) => o.id === s.opId) ?? ({} as never)),
      responseHeaders: {}, responseBody: s.body,
    });
    setCompareItems([toHist(a), toHist(b)]);
  }
```
주의: defaultInputs는 operation 필요 — op 못 찾으면 빈 inputs. 안전하게 op 있을 때만 변환하거나, op 없으면 최소 inputs(`{pathParams:{},queryParams:[],headers:[],body:""}`) 사용. 구현 시 타입 맞춰라.

자동 주기 useEffect:
```tsx
  useEffect(() => {
    const cfg = activeSpecUrl ? loadTTConfig(activeSpecUrl) : null;
    if (!cfg?.autoOn || cfg.opIds.length === 0) return;
    const timer = setInterval(() => captureSnapshots(cfg.opIds), cfg.intervalMin * 60000);
    return () => clearInterval(timer);
  }, [activeSpecUrl, ttOpen]); // ttOpen 의존으로 모달에서 설정 바꾼 뒤 반영
```
(loadTTConfig import 추가. captureSnapshots는 최신 클로저 필요 — 간단히 위 deps로. 정확성 위해 captureSnapshots를 ref로 감싸도 됨. 구현자 판단)

상단바 버튼("가이드" 근처): `시간여행` 버튼 disabled={!spec}, onClick setTtOpen(true)
모달 렌더:
```tsx
      {ttOpen && spec && (
        <TimeTravelModal specUrl={activeSpecUrl || specUrl} spec={spec} snapshots={snapshots}
          onCapture={captureSnapshots} onCompare={compareSnapshots} onClose={() => setTtOpen(false)} />
      )}
```

- [ ] **Step 5: App.css**

```css
/* API 시간여행 모달 */
.modal.tt-modal { width: 720px; max-width: 94vw; height: 80vh; }
.tt-body { display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
.tt-control { display: flex; align-items: center; gap: 10px; }
.tt-auto { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); }
.tt-auto-on { font-size: 11px; color: #3fb950; }
.tt-section { font-size: 11px; font-weight: 700; color: var(--muted); }
.tt-targets { max-height: 120px; overflow: auto; border: 1px solid var(--border); border-radius: 6px; padding: 4px; }
.tt-target-check { display: flex; align-items: center; gap: 6px; padding: 3px 6px; font-size: 12px; cursor: pointer; }
.tt-target-check:hover { background: var(--bg-3); }
.tt-path { font-family: ui-monospace, monospace; }
.tt-timeline-head { display: flex; align-items: center; gap: 8px; }
.tt-timeline { flex: 1; overflow: auto; border: 1px solid var(--border); border-radius: 6px; }
.tt-snap-row { display: flex; align-items: center; gap: 8px; padding: 4px 8px; font-size: 12px; border-bottom: 1px solid var(--border); }
.tt-snap-time { font-family: ui-monospace, monospace; flex: 1; }
.tt-snap-status { font-weight: 700; }
.tt-snap-dur { color: var(--muted); }
.tt-body-view { max-height: 200px; overflow: auto; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 8px; font-family: ui-monospace, monospace; font-size: 11px; white-space: pre-wrap; }
```

- [ ] **Step 6: 검증 + 커밋**

```
npx vitest run && npx tsc --noEmit && npx eslint src/App.tsx src/components/TimeTravelModal.tsx src/core/snapshots.ts && npm run build 2>&1 | tail -1
```
커밋: `기능: API 시간여행 모달 + 스냅샷 캡처·자동주기·비교 연결`

---

## Self-Review
- 스펙 커버리지: Snapshot/Config·저장·cap·그룹화(Task1) ✓ / 수동 캡처(Task2 onCapture) ✓ / 자동주기(Task2 App useEffect) ✓ / 타임라인 탐색·응답보기(Task2, alert 금지→pre) ✓ / 2개 비교 CompareModal 재활용(Task2 어댑터) ✓ / 대상 체크(Task2) ✓
- 타입: Snapshot/TimeTravelConfig snapshots.ts 정의 ↔ Modal/App 일치. onCapture(opIds)/onCompare(a,b) 시그니처 일치. Snapshot→HistoryItem 어댑터 필드 매핑 ✓
- 플레이스홀더 없음(응답보기는 인라인 pre로 명시) ✓
