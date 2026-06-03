# 플로우 빌더(순차) Implementation Plan

> **For agentic workers:** subagent-driven-development / executing-plans. Checkbox steps.

**Goal:** API 단계를 세로로 나열해 순차 실행하며 변수를 전달하는 플로우를 만들고 단계별 결과를 본다.

**Spec:** `docs/superpowers/specs/2026-06-03-flow-builder-design.md`

작업 디렉터리 `apps/desktop`, 브랜치 main, 한국어. 재활용(시그니처 확인됨): `applyExtractRules(responseBody: string, rules: ExtractRule[]): Record<string,string>`, `runAssertions(status: number, responseBody: string, assertions: Assertion[]): AssertionResult[]`, `substituteVars`(App execStep에서). ExtractRule{varName,path}, Assertion{kind,path?,op,expected?}.

---

### Task 1: core/flow.ts

**Files:** Create `src/core/flow.ts`, `src/core/flow.test.ts`

- [ ] **Step 1: 테스트**

```ts
// src/core/flow.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadFlows, saveFlows, addStep, removeStep, moveStep, runFlow, newFlow,
  type Flow, type ExecResult,
} from "./flow";

beforeEach(() => localStorage.clear());
const URL = "https://api.test/s.json";

function flowWith(steps: Flow["steps"]): Flow {
  return { id: "f1", name: "테스트", steps };
}

describe("flow CRUD", () => {
  it("addStep으로 단계 추가", () => {
    const f = addStep(newFlow("F"), "GET /a", "GET /a");
    expect(f.steps).toHaveLength(1);
    expect(f.steps[0].opId).toBe("GET /a");
  });
  it("removeStep으로 삭제", () => {
    let f = addStep(addStep(newFlow("F"), "GET /a", "a"), "GET /b", "b");
    f = removeStep(f, f.steps[0].id);
    expect(f.steps.map((s) => s.opId)).toEqual(["GET /b"]);
  });
  it("moveStep으로 순서 이동(0→1)", () => {
    let f = addStep(addStep(newFlow("F"), "GET /a", "a"), "GET /b", "b");
    f = moveStep(f, 0, 1);
    expect(f.steps.map((s) => s.opId)).toEqual(["GET /b", "GET /a"]);
  });
  it("저장/복원", () => {
    saveFlows(URL, [flowWith([])]);
    expect(loadFlows(URL)).toHaveLength(1);
  });
});

describe("runFlow", () => {
  it("단계를 순서대로 실행하고 추출 변수를 다음 단계로 전달한다", async () => {
    const f = flowWith([
      { id: "s1", opId: "POST /login", name: "login", extractRules: [{ varName: "token", path: "data.token" }], assertions: [] },
      { id: "s2", opId: "GET /me", name: "me", extractRules: [], assertions: [{ kind: "status", op: "equals", expected: "200" }] },
    ]);
    const calls: Array<{ opId: string; vars: Record<string, string> }> = [];
    const execOne = async (opId: string, vars: Record<string, string>): Promise<ExecResult> => {
      calls.push({ opId, vars: { ...vars } });
      if (opId === "POST /login") return { status: 200, ok: true, body: '{"data":{"token":"ABC"}}', durationMs: 5 };
      return { status: 200, ok: true, body: "{}", durationMs: 3 };
    };
    const { results, vars } = await runFlow(f, execOne, {});
    expect(calls[0].opId).toBe("POST /login");
    expect(calls[1].opId).toBe("GET /me");
    expect(calls[1].vars.token).toBe("ABC"); // 1단계 추출이 2단계로 전달
    expect(vars.token).toBe("ABC");
    expect(results[0].extracted.token).toBe("ABC");
    expect(results[1].assertResults[0].ok).toBe(true); // status 200 == 200
  });

  it("execOne이 status 0(오류)이어도 계속 실행하고 error 기록", async () => {
    const f = flowWith([
      { id: "s1", opId: "GET /a", name: "a", extractRules: [], assertions: [] },
      { id: "s2", opId: "GET /b", name: "b", extractRules: [], assertions: [] },
    ]);
    const execOne = async (opId: string): Promise<ExecResult> =>
      opId === "GET /a" ? { status: 0, ok: false, body: "", durationMs: 0, error: "네트워크" } : { status: 200, ok: true, body: "{}", durationMs: 1 };
    const { results } = await runFlow(f, execOne, {});
    expect(results[0].error).toBe("네트워크");
    expect(results[1].status).toBe(200); // 계속 실행
  });

  it("JSON 아닌 응답은 추출 skip(빈 extracted)", async () => {
    const f = flowWith([{ id: "s1", opId: "GET /a", name: "a", extractRules: [{ varName: "x", path: "y" }], assertions: [] }]);
    const execOne = async (): Promise<ExecResult> => ({ status: 200, ok: true, body: "plain text", durationMs: 1 });
    const { results } = await runFlow(f, execOne, {});
    expect(results[0].extracted).toEqual({});
  });
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현**

```ts
// src/core/flow.ts
// 순차 플로우: API 단계를 순서대로 실행하며 변수를 전달한다. 실행 함수는 주입(순수 코어).
import { loadJSON, saveJSON } from "./storage";
import { applyExtractRules, runAssertions, type ExtractRule, type Assertion, type AssertionResult } from "./variables";

export interface FlowStep {
  id: string;
  opId: string;
  name: string;
  extractRules: ExtractRule[];
  assertions: Assertion[];
}

export interface Flow {
  id: string;
  name: string;
  steps: FlowStep[];
}

export interface FlowStepResult {
  stepId: string;
  status: number;
  ok: boolean;
  durationMs: number;
  assertResults: AssertionResult[];
  extracted: Record<string, string>;
  error?: string;
}

/** App이 주입하는 단계 실행 함수 결과. */
export interface ExecResult {
  status: number;
  ok: boolean;
  body: string;
  durationMs: number;
  error?: string;
}
export type ExecOne = (opId: string, vars: Record<string, string>) => Promise<ExecResult>;

let seq = 0;
function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${seq++}`;
}

export function newFlow(name: string): Flow {
  return { id: uid("flow"), name, steps: [] };
}

export function addStep(flow: Flow, opId: string, name: string): Flow {
  return { ...flow, steps: [...flow.steps, { id: uid("step"), opId, name, extractRules: [], assertions: [] }] };
}

export function removeStep(flow: Flow, stepId: string): Flow {
  return { ...flow, steps: flow.steps.filter((s) => s.id !== stepId) };
}

/** from 인덱스의 단계를 to 인덱스로 이동. */
export function moveStep(flow: Flow, from: number, to: number): Flow {
  const steps = [...flow.steps];
  if (from < 0 || from >= steps.length || to < 0 || to >= steps.length) return flow;
  const [moved] = steps.splice(from, 1);
  steps.splice(to, 0, moved);
  return { ...flow, steps };
}

export function loadFlows(specUrl: string): Flow[] {
  return loadJSON<Flow[]>(`swaggerman.flows.${specUrl}`, []);
}
export function saveFlows(specUrl: string, flows: Flow[]): void {
  saveJSON(`swaggerman.flows.${specUrl}`, flows);
}

/** 플로우를 순차 실행한다. 단계마다 누적 vars로 execOne 호출 → 추출 변수 병합 → 어서션.
 *  어서션 실패/오류여도 계속 진행하고 결과만 기록한다. */
export async function runFlow(
  flow: Flow,
  execOne: ExecOne,
  initialVars: Record<string, string>,
): Promise<{ results: FlowStepResult[]; vars: Record<string, string> }> {
  const vars: Record<string, string> = { ...initialVars };
  const results: FlowStepResult[] = [];
  for (const step of flow.steps) {
    const res = await execOne(step.opId, vars);
    const extracted = res.body ? applyExtractRules(res.body, step.extractRules) : {};
    Object.assign(vars, extracted);
    const assertResults = runAssertions(res.status, res.body, step.assertions);
    results.push({
      stepId: step.id,
      status: res.status,
      ok: res.ok,
      durationMs: res.durationMs,
      assertResults,
      extracted,
      error: res.error,
    });
  }
  return { results, vars };
}
```

- [ ] **Step 4: 통과 + 커밋** `기능: 플로우 코어 — 단계 CRUD·순차 실행 엔진(변수 전달·어서션)`

---

### Task 2: FlowModal + App 통합

**Files:** Create `src/components/FlowModal.tsx`, `src/components/FlowModal.test.tsx`. Modify `src/App.tsx`, `src/App.css`

- [ ] **Step 1: 모달 테스트**

```tsx
// src/components/FlowModal.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FlowModal } from "./FlowModal";
import type { ParsedSpec, ParsedOperation } from "../core/types";
import type { ExecResult } from "../core/flow";

const ops: ParsedOperation[] = [
  { id: "POST /login", method: "POST", path: "/login", tags: [], parameters: [], responses: [] },
  { id: "GET /me", method: "GET", path: "/me", tags: [], parameters: [], responses: [] },
];
const spec = { info: { title: "T", version: "1" }, operations: ops, securitySchemes: [] } as unknown as ParsedSpec;

beforeEach(() => localStorage.clear());

function renderModal(execOne?: (opId: string, vars: Record<string, string>) => Promise<ExecResult>) {
  const fn = execOne ?? vi.fn(async () => ({ status: 200, ok: true, body: "{}", durationMs: 1 }));
  render(<FlowModal specUrl="u" spec={spec} initialVars={{}} execOne={fn} onClose={vi.fn()} />);
  return fn;
}

describe("FlowModal", () => {
  it("새 플로우를 만들고 단계를 추가한다", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /새 플로우/ }));
    // operation 선택 후 단계 추가 (UI에 '단계 추가' 버튼 + operation Select)
    fireEvent.click(screen.getByRole("button", { name: /단계 추가/ }));
    expect(screen.getAllByText(/\/login|\/me/).length).toBeGreaterThan(0);
  });

  it("전체 실행 시 execOne을 호출하고 결과를 표시한다", async () => {
    const execOne = vi.fn(async () => ({ status: 200, ok: true, body: '{"token":"X"}', durationMs: 2 }));
    renderModal(execOne);
    fireEvent.click(screen.getByRole("button", { name: /새 플로우/ }));
    fireEvent.click(screen.getByRole("button", { name: /단계 추가/ }));
    fireEvent.click(screen.getByRole("button", { name: /전체 실행/ }));
    await waitFor(() => expect(execOne).toHaveBeenCalled());
    expect(await screen.findByText(/200/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: FlowModal 구현**

```tsx
// src/components/FlowModal.tsx
// 순차 플로우 빌더: 단계 나열·드래그 재배치·순차 실행·단계별 결과.
import { useState } from "react";
import type { ParsedSpec } from "../core/types";
import {
  loadFlows, saveFlows, newFlow, addStep, removeStep, moveStep, runFlow,
  type Flow, type FlowStep, type FlowStepResult, type ExecOne,
} from "../core/flow";
import type { ExtractRule, Assertion } from "../core/variables";
import { Select } from "./Select";
import { methodColor, statusColor } from "./method";
import { CloseCircleIcon, TrashIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";

interface Props {
  specUrl: string;
  spec: ParsedSpec;
  initialVars: Record<string, string>;
  execOne: ExecOne;
  onClose: () => void;
}

export function FlowModal({ specUrl, spec, initialVars, execOne, onClose }: Props) {
  useEscToClose(onClose);
  const [flows, setFlows] = useState<Flow[]>(() => loadFlows(specUrl));
  const [activeId, setActiveId] = useState<string | null>(() => loadFlows(specUrl)[0]?.id ?? null);
  const [results, setResults] = useState<Record<string, FlowStepResult>>({});
  const [running, setRunning] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [newOpId, setNewOpId] = useState(spec.operations[0]?.id ?? "");

  const active = flows.find((f) => f.id === activeId) ?? null;

  const persist = (next: Flow[]) => {
    setFlows(next);
    saveFlows(specUrl, next);
  };
  const updateActive = (fn: (f: Flow) => Flow) => {
    if (!active) return;
    persist(flows.map((f) => (f.id === active.id ? fn(f) : f)));
  };

  const createFlow = () => {
    const f = newFlow(`플로우 ${flows.length + 1}`);
    persist([...flows, f]);
    setActiveId(f.id);
  };

  const addStepToActive = () => {
    const op = spec.operations.find((o) => o.id === newOpId);
    if (!op) return;
    updateActive((f) => addStep(f, op.id, `${op.method} ${op.path}`));
  };

  const patchStep = (stepId: string, patch: Partial<FlowStep>) =>
    updateActive((f) => ({ ...f, steps: f.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)) }));

  const onDrop = (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) return;
    updateActive((f) => moveStep(f, dragIdx, toIdx));
    setDragIdx(null);
  };

  const execute = async () => {
    if (!active) return;
    setRunning(true);
    setResults({});
    const { results: rs } = await runFlow(active, execOne, initialVars);
    const map: Record<string, FlowStepResult> = {};
    for (const r of rs) map[r.stepId] = r;
    setResults(map);
    setRunning(false);
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal flow-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>플로우 빌더</h3>
          <button className="icon-btn" onClick={onClose} title="닫기"><CloseCircleIcon size={18} /></button>
        </div>
        <div className="modal-body flow-body">
          <div className="flow-bar">
            <Select value={activeId ?? ""} onChange={setActiveId}
              options={flows.map((f) => ({ value: f.id, label: f.name }))} placeholder="플로우 선택" />
            <button className="btn small" onClick={createFlow}>+ 새 플로우</button>
            {active && active.steps.length > 0 && (
              <button className="btn small primary" disabled={running} onClick={execute}>
                {running ? "실행 중…" : "▶ 전체 실행"}
              </button>
            )}
          </div>

          {!active ? (
            <div className="hint center">새 플로우를 만들어 시작하세요.</div>
          ) : (
            <>
              <div className="flow-add">
                <Select value={newOpId} onChange={setNewOpId}
                  options={spec.operations.map((o) => ({ value: o.id, label: `${o.method} ${o.path}` }))} />
                <button className="btn small" onClick={addStepToActive}>+ 단계 추가</button>
              </div>
              <div className="flow-steps">
                {active.steps.map((step, idx) => {
                  const r = results[step.id];
                  const op = spec.operations.find((o) => o.id === step.opId);
                  return (
                    <div className="flow-step" key={step.id} draggable
                      onDragStart={() => setDragIdx(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(idx)}>
                      <div className="flow-step-head">
                        <span className="flow-drag">≡</span>
                        <span className="flow-step-num">{idx + 1}</span>
                        {op ? (
                          <span className="method" style={{ color: methodColor(op.method) }}>{op.method}</span>
                        ) : null}
                        <span className="flow-step-path">{op ? op.path : `(없는 operation: ${step.opId})`}</span>
                        {r && (
                          <span className="flow-step-result" style={{ color: r.error ? "#f85149" : statusColor(r.status) }}>
                            {r.error ? "ERR" : r.status}
                          </span>
                        )}
                        <button className="icon-btn" onClick={() => updateActive((f) => removeStep(f, step.id))} title="단계 삭제">
                          <TrashIcon size={13} />
                        </button>
                      </div>
                      {/* 추출 규칙 */}
                      <div className="flow-step-edit">
                        <div className="flow-sub">추출 (응답→변수)</div>
                        {step.extractRules.map((rule, ri) => (
                          <div className="flow-rule-row" key={ri}>
                            <input className="kv-input" value={rule.varName} placeholder="변수명"
                              onChange={(e) => patchStep(step.id, { extractRules: step.extractRules.map((x, j) => j === ri ? { ...x, varName: e.target.value } : x) })} />
                            <input className="kv-input" value={rule.path} placeholder="JSONPath"
                              onChange={(e) => patchStep(step.id, { extractRules: step.extractRules.map((x, j) => j === ri ? { ...x, path: e.target.value } : x) })} />
                            <button className="icon-btn" onClick={() => patchStep(step.id, { extractRules: step.extractRules.filter((_, j) => j !== ri) })}><CloseCircleIcon size={13} /></button>
                          </div>
                        ))}
                        <button className="add-row" onClick={() => patchStep(step.id, { extractRules: [...step.extractRules, { varName: "", path: "" } as ExtractRule] })}>+ 추출 규칙</button>
                        {r && Object.keys(r.extracted).length > 0 && (
                          <div className="flow-extracted">추출됨: {Object.entries(r.extracted).map(([k, v]) => `${k}=${v}`).join(", ")}</div>
                        )}
                        {/* 어서션 */}
                        <div className="flow-sub">어서션</div>
                        {step.assertions.map((a, ai) => (
                          <div className="flow-rule-row" key={ai}>
                            <Select value={a.kind} onChange={(v) => patchStep(step.id, { assertions: step.assertions.map((x, j) => j === ai ? { ...x, kind: v as Assertion["kind"] } : x) })}
                              options={[{ value: "status", label: "status" }, { value: "jsonpath", label: "jsonpath" }]} />
                            {a.kind === "jsonpath" && (
                              <input className="kv-input" value={a.path ?? ""} placeholder="JSONPath"
                                onChange={(e) => patchStep(step.id, { assertions: step.assertions.map((x, j) => j === ai ? { ...x, path: e.target.value } : x) })} />
                            )}
                            <Select value={a.op} onChange={(v) => patchStep(step.id, { assertions: step.assertions.map((x, j) => j === ai ? { ...x, op: v as Assertion["op"] } : x) })}
                              options={[{ value: "equals", label: "=" }, { value: "contains", label: "포함" }, { value: "exists", label: "존재" }]} />
                            {a.op !== "exists" && (
                              <input className="kv-input" value={a.expected ?? ""} placeholder="기대값"
                                onChange={(e) => patchStep(step.id, { assertions: step.assertions.map((x, j) => j === ai ? { ...x, expected: e.target.value } : x) })} />
                            )}
                            <button className="icon-btn" onClick={() => patchStep(step.id, { assertions: step.assertions.filter((_, j) => j !== ai) })}><CloseCircleIcon size={13} /></button>
                          </div>
                        ))}
                        <button className="add-row" onClick={() => patchStep(step.id, { assertions: [...step.assertions, { kind: "status", op: "equals", expected: "200" } as Assertion] })}>+ 어서션</button>
                        {r && r.assertResults.length > 0 && (
                          <div className="flow-asserts">
                            {r.assertResults.map((ar, j) => (
                              <span key={j} className={ar.ok ? "flow-assert-ok" : "flow-assert-bad"} title={ar.detail}>{ar.ok ? "✅" : "❌"} {ar.label}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: App.tsx 통합**

import: `import { FlowModal } from "./components/FlowModal";`, `import type { ExecResult } from "./core/flow";`
state: `const [flowOpen, setFlowOpen] = useState(false);`
execStep 콜백(buildRequest + substituteVars는 buildRequest 내부에서 vars로 처리됨 — buildRequest(baseURL, op, inputs, secHeaders, globalHeaders, vars)):
```tsx
  async function execFlowStep(opId: string, vars: Record<string, string>): Promise<ExecResult> {
    if (!spec) return { status: 0, ok: false, body: "", durationMs: 0, error: "스펙 없음" };
    const op = spec.operations.find((o) => o.id === opId);
    if (!op) return { status: 0, ok: false, body: "", durationMs: 0, error: "없는 operation" };
    const ins = defaultInputs(op);
    const securityHeaders = computeSecurityHeaders(spec.securitySchemes ?? [], authValues);
    const mergedVars = { ...activeVars, ...vars };
    const request = buildRequest(baseURL, op, ins, securityHeaders, globalHeaders, mergedVars);
    const t0 = Date.now();
    try {
      const res = await executeRequest(request, netSettings);
      return { status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, body: res.body, durationMs: res.durationMs };
    } catch (e) {
      return { status: 0, ok: false, body: "", durationMs: Date.now() - t0, error: String(e) };
    }
  }
```
상단바 버튼("시간여행" 근처): `플로우` 버튼 disabled={!spec}
모달 렌더:
```tsx
      {flowOpen && spec && (
        <FlowModal specUrl={activeSpecUrl || specUrl} spec={spec} initialVars={activeVars} execOne={execFlowStep} onClose={() => setFlowOpen(false)} />
      )}
```

- [ ] **Step 5: App.css**

```css
/* 플로우 빌더 모달 */
.modal.flow-modal { width: 760px; max-width: 95vw; height: 84vh; }
.flow-body { display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
.flow-bar { display: flex; gap: 8px; align-items: center; }
.flow-add { display: flex; gap: 8px; align-items: center; }
.flow-steps { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
.flow-step { border: 1px solid var(--border); border-radius: 8px; background: var(--bg-2); }
.flow-step-head { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--border); }
.flow-drag { cursor: grab; color: var(--muted); }
.flow-step-num { font-weight: 700; color: var(--muted); }
.flow-step-path { font-family: ui-monospace, monospace; flex: 1; }
.flow-step-result { font-weight: 700; font-family: ui-monospace, monospace; }
.flow-step-edit { padding: 6px 10px; display: flex; flex-direction: column; gap: 4px; }
.flow-sub { font-size: 10px; font-weight: 700; color: var(--muted); margin-top: 4px; }
.flow-rule-row { display: flex; gap: 6px; align-items: center; }
.flow-extracted { font-size: 11px; color: #3fb950; font-family: ui-monospace, monospace; }
.flow-asserts { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; }
.flow-assert-ok { color: #3fb950; }
.flow-assert-bad { color: #f85149; }
```

- [ ] **Step 6: 검증 + 커밋**

```
npx vitest run && npx tsc --noEmit && npx eslint src/App.tsx src/components/FlowModal.tsx src/core/flow.ts && npm run build 2>&1 | tail -1
```
커밋: `기능: 플로우 빌더 모달 + 순차 실행 연결(드래그 재배치·단계 결과)`

---

## Self-Review
- 스펙 커버리지: Flow/Step/Result·CRUD·runFlow(Task1) ✓ / 변수 전달·어서션·오류 계속(Task1) ✓ / 단계 나열·드래그(Task2) ✓ / 추출·어서션 편집(Task2) ✓ / 전체 실행·단계 결과(Task2) ✓ / 상단바 버튼(Task2) ✓
- 타입: Flow/FlowStep/FlowStepResult/ExecResult/ExecOne flow.ts 정의 ↔ FlowModal/App 일치. applyExtractRules(body,rules)/runAssertions(status,body,assertions) 실제 시그니처 사용 ✓
- 플레이스홀더 없음 ✓
- 리스크: FlowModal이 큰 컴포넌트(추출/어서션 편집 포함) — 단일 파일이나 책임은 "플로우 편집+실행"으로 응집. 너무 크면 StepEditor 분리 가능하나 1차는 단일.
