# 권한 매트릭스 테스트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 페르소나(토큰 묶음) 여러 개로 선택한 API들을 호출해 (페르소나×API) 상태코드 매트릭스를 만들어 권한 차이를 시각화한다.

**Architecture:** 순수 오케스트레이션 모듈(`core/permission-matrix.ts`, 실행 함수는 주입)과 모달 UI(`PermissionMatrixModal.tsx`)를 분리한다. 실제 요청 실행은 기존 `buildRequest`/`executeRequest` 패턴(runSaved와 동일)을 App.tsx의 콜백으로 재활용한다.

**Tech Stack:** TypeScript, React 19, vitest(jsdom), 기존 request-builder/http-client.

**Spec:** `docs/superpowers/specs/2026-06-03-permission-matrix-design.md`

작업 디렉터리: `/Users/82312411gimjaehyeog/Dev/swagger-man/apps/desktop`. 모든 명령은 이 디렉터리에서. 브랜치: `main` 직접 커밋. 한국어 주석/커밋.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/core/permission-matrix.ts` (신규) | Persona/MatrixCell/MatrixResult 타입, loadPersonas/savePersonas, defaultPersonas, statusKind, runMatrix(오케스트레이션) |
| `src/core/permission-matrix.test.ts` (신규) | 단위 테스트 |
| `src/components/PermissionMatrixModal.tsx` (신규) | 페르소나 편집 + API 체크 + 실행 + 결과 표 |
| `src/components/PermissionMatrixModal.test.tsx` (신규) | UI 테스트 |
| `src/App.tsx` (수정) | 상단바 버튼 + 모달 + runForPersona 콜백 |
| `src/App.css` (수정) | `.pmatrix-*` 스타일 |

---

### Task 1: core/permission-matrix.ts — 타입·영속화·statusKind

**Files:**
- Create: `src/core/permission-matrix.ts`
- Create: `src/core/permission-matrix.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/core/permission-matrix.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadPersonas,
  savePersonas,
  defaultPersonas,
  statusKind,
  type Persona,
} from "./permission-matrix";

beforeEach(() => localStorage.clear());

describe("statusKind", () => {
  it("상태코드를 분류한다", () => {
    expect(statusKind(200)).toBe("success");
    expect(statusKind(201)).toBe("success");
    expect(statusKind(302)).toBe("redirect");
    expect(statusKind(401)).toBe("perm");
    expect(statusKind(403)).toBe("perm");
    expect(statusKind(404)).toBe("error");
    expect(statusKind(500)).toBe("error");
    expect(statusKind(0)).toBe("net");
  });
});

describe("defaultPersonas", () => {
  it("관리자/일반/게스트 3개를 만들고 게스트는 빈 토큰이다", () => {
    const ps = defaultPersonas();
    expect(ps).toHaveLength(3);
    expect(ps.map((p) => p.name)).toEqual(["관리자", "일반", "게스트"]);
    expect(ps[2].token).toBe("");
    // id는 서로 다름
    expect(new Set(ps.map((p) => p.id)).size).toBe(3);
  });
});

describe("loadPersonas / savePersonas", () => {
  it("저장 후 같은 specUrl로 복원한다", () => {
    const ps: Persona[] = [{ id: "a", name: "관리자", token: "TOK" }];
    savePersonas("https://api.test/s.json", ps);
    expect(loadPersonas("https://api.test/s.json")).toEqual(ps);
  });
  it("저장된 적 없으면 빈 배열", () => {
    expect(loadPersonas("https://none/s.json")).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/core/permission-matrix.test.ts`
Expected: FAIL — `Cannot find module './permission-matrix'`

- [ ] **Step 3: 구현**

```ts
// src/core/permission-matrix.ts
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
function newId(): string {
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
```

참고: defaultPersonas의 "관리자/일반"도 token이 ""이다(테스트는 게스트만 명시 확인). 사용자가 토큰을 채운다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/core/permission-matrix.test.ts`
Expected: PASS (4개)

- [ ] **Step 5: 커밋**

```bash
git add src/core/permission-matrix.ts src/core/permission-matrix.test.ts
git commit -m "기능: 권한 매트릭스 코어 — 페르소나 타입·영속화·상태 분류

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: runMatrix 오케스트레이션

**Files:**
- Modify: `src/core/permission-matrix.ts`
- Modify: `src/core/permission-matrix.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`permission-matrix.test.ts` 끝에 추가:

```ts
import { runMatrix, type MatrixCell } from "./permission-matrix";

describe("runMatrix", () => {
  const personas: Persona[] = [
    { id: "admin", name: "관리자", token: "ADMIN_TOK" },
    { id: "guest", name: "게스트", token: "" },
  ];
  const opIds = ["GET /a", "GET /b"];

  it("모든 (op × persona) 조합에 runOne을 호출하고 결과를 매핑한다", async () => {
    const calls: Array<{ opId: string; token: string }> = [];
    const runOne = async (opId: string, token: string): Promise<MatrixCell> => {
      calls.push({ opId, token });
      // admin은 200, guest는 401
      const status = token ? 200 : 401;
      return { status, ok: status < 300, durationMs: 5 };
    };
    const result = await runMatrix(personas, opIds, runOne);
    expect(calls).toHaveLength(4); // 2 op × 2 persona
    expect(result["GET /a"]["admin"].status).toBe(200);
    expect(result["GET /a"]["guest"].status).toBe(401);
    expect(result["GET /b"]["admin"].ok).toBe(true);
  });

  it("runOne이 throw해도 해당 셀만 net 에러로 기록하고 계속한다", async () => {
    const runOne = async (opId: string): Promise<MatrixCell> => {
      if (opId === "GET /a") throw new Error("boom");
      return { status: 200, ok: true, durationMs: 1 };
    };
    const result = await runMatrix(personas, opIds, runOne);
    expect(result["GET /a"]["admin"].status).toBe(0);
    expect(result["GET /a"]["admin"].error).toContain("boom");
    expect(result["GET /b"]["admin"].status).toBe(200); // 나머지는 정상
  });

  it("진행 콜백이 완료 개수만큼 호출된다", async () => {
    const progress: number[] = [];
    const runOne = async (): Promise<MatrixCell> => ({ status: 200, ok: true, durationMs: 1 });
    await runMatrix(personas, opIds, runOne, (done, total) => progress.push(done) || expect(total).toBe(4));
    expect(progress).toEqual([1, 2, 3, 4]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/core/permission-matrix.test.ts`
Expected: FAIL — `runMatrix is not a function`

- [ ] **Step 3: 구현 추가**

`permission-matrix.ts` 끝에 추가:

```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/core/permission-matrix.test.ts`
Expected: PASS (7개)

- [ ] **Step 5: 타입체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/core/permission-matrix.ts src/core/permission-matrix.test.ts`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/core/permission-matrix.ts src/core/permission-matrix.test.ts
git commit -m "기능: 권한 매트릭스 실행 오케스트레이션 — 조합 순차 실행·진행률·셀 에러 격리

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: PermissionMatrixModal — 페르소나 편집 + API 체크

**Files:**
- Create: `src/components/PermissionMatrixModal.tsx`
- Create: `src/components/PermissionMatrixModal.test.tsx`

이 태스크는 페르소나 편집 + API 체크박스 + 실행 버튼까지(결과 표는 Task 4). Props:

```ts
interface Props {
  specUrl: string;
  operations: ParsedOperation[];
  /** (opId, token) → 셀. App.tsx가 주입(실제 요청 실행) */
  runOne: (opId: string, token: string) => Promise<MatrixCell>;
  onClose: () => void;
}
```

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// src/components/PermissionMatrixModal.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PermissionMatrixModal } from "./PermissionMatrixModal";
import type { ParsedOperation } from "../core/types";
import type { MatrixCell } from "../core/permission-matrix";

const ops: ParsedOperation[] = [
  { id: "GET /pets", method: "GET", path: "/pets", tags: [], parameters: [], responses: [] },
  { id: "POST /pets", method: "POST", path: "/pets", tags: [], parameters: [], responses: [] },
];

beforeEach(() => localStorage.clear());

function renderModal(runOne?: (opId: string, token: string) => Promise<MatrixCell>) {
  const fn = runOne ?? vi.fn(async () => ({ status: 200, ok: true, durationMs: 1 }));
  render(<PermissionMatrixModal specUrl="https://api.test/s.json" operations={ops} runOne={fn} onClose={vi.fn()} />);
  return fn;
}

describe("PermissionMatrixModal 설정", () => {
  it("기본 페르소나 3개를 표시한다", () => {
    renderModal();
    expect(screen.getByDisplayValue("관리자")).toBeTruthy();
    expect(screen.getByDisplayValue("일반")).toBeTruthy();
    expect(screen.getByDisplayValue("게스트")).toBeTruthy();
  });

  it("페르소나를 추가할 수 있다", () => {
    renderModal();
    const before = screen.getAllByPlaceholderText("토큰 (Bearer 자동)").length;
    fireEvent.click(screen.getByRole("button", { name: /페르소나 추가/ }));
    expect(screen.getAllByPlaceholderText("토큰 (Bearer 자동)").length).toBe(before + 1);
  });

  it("GET API는 기본 체크, 비-GET은 미체크다", () => {
    renderModal();
    const getRow = screen.getByText("/pets", { selector: ".pmatrix-op-path" }).closest(".pmatrix-op-check") as HTMLElement;
    void getRow;
    const checks = screen.getAllByRole("checkbox");
    // GET /pets 체크박스는 checked, POST /pets는 unchecked
    const getCheck = checks.find((c) => c.getAttribute("data-opid") === "GET /pets") as HTMLInputElement;
    const postCheck = checks.find((c) => c.getAttribute("data-opid") === "POST /pets") as HTMLInputElement;
    expect(getCheck.checked).toBe(true);
    expect(postCheck.checked).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/components/PermissionMatrixModal.test.tsx`
Expected: FAIL — `Cannot find module './PermissionMatrixModal'`

- [ ] **Step 3: 구현 (설정 영역 + 실행 버튼, 결과 표는 Task 4 stub)**

```tsx
// src/components/PermissionMatrixModal.tsx
// 권한 매트릭스: 페르소나(토큰)별로 선택한 API를 호출해 상태코드 표를 만든다.
import { useEffect, useMemo, useState } from "react";
import type { ParsedOperation } from "../core/types";
import {
  loadPersonas,
  savePersonas,
  defaultPersonas,
  runMatrix,
  type Persona,
  type MatrixCell,
  type MatrixResult,
} from "../core/permission-matrix";
import { methodColor } from "./method";
import { CloseCircleIcon, TrashIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";
import { ConfirmDialog } from "./ConfirmDialog";

interface Props {
  specUrl: string;
  operations: ParsedOperation[];
  runOne: (opId: string, token: string) => Promise<MatrixCell>;
  onClose: () => void;
}

let pidSeq = 0;

export function PermissionMatrixModal({ specUrl, operations, runOne, onClose }: Props) {
  useEscToClose(onClose);

  const [personas, setPersonas] = useState<Persona[]>(() => {
    const loaded = loadPersonas(specUrl);
    return loaded.length > 0 ? loaded : defaultPersonas();
  });
  // GET만 기본 체크
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(operations.filter((o) => o.method === "GET").map((o) => o.id)),
  );
  const [result, setResult] = useState<MatrixResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [confirmWrite, setConfirmWrite] = useState(false);

  useEffect(() => {
    savePersonas(specUrl, personas);
  }, [specUrl, personas]);

  const checkedOps = useMemo(
    () => operations.filter((o) => checked.has(o.id)),
    [operations, checked],
  );
  const writeCount = useMemo(
    () => checkedOps.filter((o) => o.method !== "GET").length,
    [checkedOps],
  );

  const patchPersona = (id: string, p: Partial<Persona>) =>
    setPersonas((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const addPersona = () =>
    setPersonas((prev) => [...prev, { id: `p-${Date.now().toString(36)}-${pidSeq++}`, name: "새 역할", token: "" }]);
  const removePersona = (id: string) => setPersonas((prev) => prev.filter((x) => x.id !== id));

  const toggleOp = (opId: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(opId)) next.delete(opId);
      else next.add(opId);
      return next;
    });

  const doRun = async () => {
    setRunning(true);
    setResult(null);
    setProgress({ done: 0, total: checkedOps.length * personas.length });
    const res = await runMatrix(
      personas,
      checkedOps.map((o) => o.id),
      runOne,
      (done, total) => setProgress({ done, total }),
    );
    setResult(res);
    setRunning(false);
  };

  const onRunClick = () => {
    if (writeCount > 0) setConfirmWrite(true);
    else doRun();
  };

  const canRun = checkedOps.length > 0 && personas.length > 0 && !running;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal pmatrix-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>권한 매트릭스</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            <CloseCircleIcon size={18} />
          </button>
        </div>
        <div className="modal-body pmatrix-body">
          {/* 페르소나 편집 */}
          <div className="pmatrix-personas">
            <div className="pmatrix-section-title">페르소나 (토큰)</div>
            {personas.map((p) => (
              <div className="pmatrix-persona-row" key={p.id}>
                <input
                  className="kv-input pmatrix-persona-name"
                  value={p.name}
                  onChange={(e) => patchPersona(p.id, { name: e.target.value })}
                  placeholder="역할 이름"
                  spellCheck={false}
                />
                <input
                  className="kv-input pmatrix-persona-token"
                  value={p.token}
                  onChange={(e) => patchPersona(p.id, { token: e.target.value })}
                  placeholder="토큰 (Bearer 자동)"
                  spellCheck={false}
                  type="password"
                />
                <button className="icon-btn" onClick={() => removePersona(p.id)} title="삭제">
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
            <button className="add-row" onClick={addPersona}>+ 페르소나 추가</button>
          </div>

          {/* API 선택 */}
          <div className="pmatrix-ops">
            <div className="pmatrix-section-title">
              대상 API ({checkedOps.length})
              {writeCount > 0 && <span className="pmatrix-warn-inline"> ⚠️ 쓰기 {writeCount}건</span>}
            </div>
            <div className="pmatrix-op-list">
              {operations.map((op) => (
                <label className="pmatrix-op-check" key={op.id}>
                  <input
                    type="checkbox"
                    data-opid={op.id}
                    checked={checked.has(op.id)}
                    onChange={() => toggleOp(op.id)}
                  />
                  <span className="method" style={{ color: methodColor(op.method) }}>{op.method}</span>
                  <span className="pmatrix-op-path">{op.path}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 실행 */}
          <div className="pmatrix-actions">
            <button className="btn small primary" disabled={!canRun} onClick={onRunClick}>
              {running ? `실행 중… (${progress.done}/${progress.total})` : "실행"}
            </button>
          </div>

          {/* 결과 표 (Task 4) */}
          {result && <MatrixTable personas={personas} ops={checkedOps} result={result} />}
        </div>
      </div>
      {confirmWrite && (
        <ConfirmDialog
          title="쓰기 요청 포함"
          message={`선택한 API 중 쓰기 요청(GET 외) ${writeCount}건이 실제 서버에 전송됩니다. 실제 데이터가 변경될 수 있습니다. 계속할까요?`}
          confirmLabel="실행"
          onConfirm={() => {
            setConfirmWrite(false);
            doRun();
          }}
          onCancel={() => setConfirmWrite(false)}
        />
      )}
    </div>
  );
}

// 결과 표는 Task 4에서 구현. 우선 stub.
function MatrixTable(_props: { personas: Persona[]; ops: ParsedOperation[]; result: MatrixResult }) {
  return <div className="hint">결과 표는 다음 단계에서 구현됩니다.</div>;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/PermissionMatrixModal.test.tsx`
Expected: PASS (3개)

- [ ] **Step 5: 커밋**

```bash
git add src/components/PermissionMatrixModal.tsx src/components/PermissionMatrixModal.test.tsx
git commit -m "기능: 권한 매트릭스 모달 — 페르소나 편집·API 체크·실행(GET 기본·쓰기 경고)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 결과 매트릭스 표 (MatrixTable)

**Files:**
- Modify: `src/components/PermissionMatrixModal.tsx` (MatrixTable 교체)
- Modify: `src/components/PermissionMatrixModal.test.tsx` (실행 테스트 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

`PermissionMatrixModal.test.tsx` 끝에 추가:

```tsx
describe("PermissionMatrixModal 실행", () => {
  it("실행하면 runOne을 호출하고 결과 표에 상태코드를 표시한다", async () => {
    const runOne = vi.fn(async (opId: string, token: string) => ({
      status: token ? 200 : 401,
      ok: !!token,
      durationMs: 3,
    }));
    render(
      <PermissionMatrixModal
        specUrl="https://api.test/s.json"
        operations={ops}
        runOne={runOne}
        onClose={vi.fn()}
      />,
    );
    // 관리자 토큰 입력
    const tokens = screen.getAllByPlaceholderText("토큰 (Bearer 자동)");
    fireEvent.change(tokens[0], { target: { value: "ADMIN" } });
    // 실행 (GET /pets만 기본 체크 → 쓰기 경고 없음)
    fireEvent.click(screen.getByRole("button", { name: "실행" }));
    // 결과 표에 상태코드 표시
    await waitFor(() => {
      expect(screen.getAllByText("200").length).toBeGreaterThan(0); // 관리자 셀
      expect(screen.getAllByText("401").length).toBeGreaterThan(0); // 빈 토큰 셀
    });
    expect(runOne).toHaveBeenCalled();
  });

  it("비-GET 체크 후 실행하면 확인 다이얼로그를 띄운다", async () => {
    renderModal();
    // POST /pets 체크
    const checks = screen.getAllByRole("checkbox");
    const postCheck = checks.find((c) => c.getAttribute("data-opid") === "POST /pets") as HTMLInputElement;
    fireEvent.click(postCheck);
    fireEvent.click(screen.getByRole("button", { name: "실행" }));
    expect(await screen.findByText(/쓰기 요청.*전송/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/components/PermissionMatrixModal.test.tsx`
Expected: FAIL (실행 테스트 — stub이 상태코드를 렌더 안 함)

- [ ] **Step 3: MatrixTable 구현 (stub 교체)**

`PermissionMatrixModal.tsx`의 `MatrixTable` 함수를 아래로 교체하고, 파일 상단 import에 `statusKind`를 추가:

import 수정 (permission-matrix import에 statusKind 추가):
```tsx
import {
  loadPersonas,
  savePersonas,
  defaultPersonas,
  runMatrix,
  statusKind,
  type Persona,
  type MatrixCell,
  type MatrixResult,
  type StatusKind,
} from "../core/permission-matrix";
```

MatrixTable 교체:
```tsx
const KIND_COLOR: Record<StatusKind, string> = {
  success: "#3fb950",
  redirect: "var(--muted)",
  perm: "#d29922",
  error: "#f85149",
  net: "#f85149",
};

function MatrixTable({
  personas,
  ops,
  result,
}: {
  personas: Persona[];
  ops: ParsedOperation[];
  result: MatrixResult;
}) {
  return (
    <div className="pmatrix-result">
      <table className="pmatrix-table">
        <thead>
          <tr>
            <th>API</th>
            {personas.map((p) => (
              <th key={p.id}>{p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ops.map((op) => (
            <tr key={op.id}>
              <td className="pmatrix-table-op">
                <span className="method" style={{ color: methodColor(op.method) }}>{op.method}</span>{" "}
                {op.path}
              </td>
              {personas.map((p) => {
                const cell = result[op.id]?.[p.id];
                if (!cell) return <td key={p.id}>—</td>;
                const kind = statusKind(cell.status);
                return (
                  <td
                    key={p.id}
                    className="pmatrix-cell"
                    style={{ color: KIND_COLOR[kind] }}
                    title={cell.error ? cell.error : `${cell.durationMs}ms`}
                  >
                    {cell.status === 0 ? "ERR" : cell.status}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/PermissionMatrixModal.test.tsx`
Expected: PASS (5개)

- [ ] **Step 5: 커밋**

```bash
git add src/components/PermissionMatrixModal.tsx src/components/PermissionMatrixModal.test.tsx
git commit -m "기능: 권한 매트릭스 결과 표 — 상태코드 색상 매트릭스(권한 강조)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: App.tsx 통합 — 버튼 + runForPersona + CSS

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: import 추가**

```tsx
import { PermissionMatrixModal } from "./components/PermissionMatrixModal";
import type { MatrixCell } from "./core/permission-matrix";
```

(`defaultInputs`가 이미 import돼 있는지 확인 — request-builder에서. 없으면 기존 request-builder import 묶음에 `defaultInputs` 추가)

- [ ] **Step 2: state 추가**

`const [shareOpen, setShareOpen] = useState(false);` 근처에 추가:

```tsx
  const [pmatrixOpen, setPmatrixOpen] = useState(false);
```

- [ ] **Step 3: runForPersona 콜백 추가**

`runSaved` 함수 근처에 추가:

```tsx
  // 권한 매트릭스: 페르소나 토큰을 Authorization: Bearer로 붙여 op를 호출하고 상태코드 반환.
  async function runForPersona(opId: string, token: string): Promise<MatrixCell> {
    const op = spec?.operations.find((o) => o.id === opId);
    if (!op) return { status: 0, ok: false, durationMs: 0, error: "operation 없음" };
    const ins = defaultInputs(op);
    const authHeaders: Record<string, string> = {};
    const t = token.trim();
    if (t) authHeaders["Authorization"] = /^bearer /i.test(t) ? t : `Bearer ${t}`;
    const request = buildRequest(baseURL, op, ins, authHeaders, globalHeaders, activeVars);
    const t0 = Date.now();
    try {
      const res = await executeRequest(request, netSettings);
      return { status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, durationMs: res.durationMs };
    } catch (e) {
      return { status: 0, ok: false, durationMs: Date.now() - t0, error: String(e) };
    }
  }
```

`buildRequest`, `executeRequest`, `defaultInputs`, `baseURL`, `globalHeaders`, `activeVars`, `netSettings`는 이미 App.tsx에 존재(runSaved에서 사용 중). `defaultInputs`만 import 확인.

- [ ] **Step 4: 상단바 버튼 추가**

"러너" 버튼 근처에 추가:

```tsx
        <button
          className="btn"
          title="권한 매트릭스 — 토큰별로 API 접근 권한(상태코드)을 표로 비교"
          onClick={() => setPmatrixOpen(true)}
          disabled={!spec}
        >
          권한
        </button>
```

- [ ] **Step 5: 모달 렌더 추가**

`{shareOpen && (<ShareModal .../>)}` 근처에 추가:

```tsx
      {pmatrixOpen && spec && (
        <PermissionMatrixModal
          specUrl={activeSpecUrl || specUrl}
          operations={spec.operations}
          runOne={runForPersona}
          onClose={() => setPmatrixOpen(false)}
        />
      )}
```

- [ ] **Step 6: CSS 추가 (App.css 끝)**

```css
/* ============================================================
 * 권한 매트릭스 모달
 * ============================================================ */
.modal.pmatrix-modal {
  width: 720px;
  max-width: 94vw;
  max-height: 85vh;
}
.pmatrix-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
}
.pmatrix-section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
  margin-bottom: 6px;
}
.pmatrix-warn-inline {
  color: #d29922;
  font-weight: 600;
}
.pmatrix-persona-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 4px;
}
.pmatrix-persona-name {
  width: 120px;
  flex: none;
}
.pmatrix-persona-token {
  flex: 1;
}
.pmatrix-op-list {
  max-height: 180px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px;
}
.pmatrix-op-check {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  font-size: 12px;
  cursor: pointer;
}
.pmatrix-op-check:hover {
  background: var(--bg-3);
}
.pmatrix-op-path {
  font-family: ui-monospace, monospace;
}
.pmatrix-actions {
  display: flex;
  gap: 8px;
}
.pmatrix-result {
  overflow: auto;
}
.pmatrix-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 12px;
}
.pmatrix-table th,
.pmatrix-table td {
  border: 1px solid var(--border);
  padding: 5px 8px;
  text-align: center;
}
.pmatrix-table th {
  background: var(--bg-3);
  color: var(--muted);
}
.pmatrix-table-op {
  text-align: left !important;
  font-family: ui-monospace, monospace;
  white-space: nowrap;
}
.pmatrix-cell {
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
```

- [ ] **Step 7: 타입체크 + 전체 테스트 + 빌드**

Run: `npx tsc --noEmit && npx vitest run 2>&1 | tail -3 && npm run build 2>&1 | tail -2`
Expected: 타입 에러 없음, 전체 PASS, 빌드 성공

- [ ] **Step 8: 커밋**

```bash
git add src/App.tsx src/App.css
git commit -m "기능: 상단바 권한 버튼 + 페르소나 토큰 실행 콜백 연결

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 검증 + 브라우저 모드 확인

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 자동 검증**

```bash
npx eslint . && npx tsc --noEmit && npx vitest run && npm run build
```
Expected: 모두 PASS (기존 AiPanel react-refresh 경고 1건은 무관)

- [ ] **Step 2: 브라우저 모드 수동 확인**

```bash
npm run dev
```
Chrome DevTools MCP로 `http://localhost:1420`:
1. Petstore 로드 → 상단바 "권한" 클릭
2. 페르소나 3개 표시 확인, 관리자에 임의 토큰 입력
3. GET API들 기본 체크 확인, POST 체크 시 "⚠️ 쓰기 N건" 표시
4. "실행" → 결과 표에 상태코드 매트릭스 렌더(Petstore는 인증 안 막혀서 대부분 200/400대)
5. POST 체크 후 실행 → 확인 다이얼로그 표시 확인
6. 페르소나 토큰이 새로고침 후에도 유지되는지(localStorage)

- [ ] **Step 3: 발견된 문제 수정 후 커밋** (있을 때만)

---

## Self-Review 체크

- **스펙 커버리지**: Persona/MatrixCell/MatrixResult 타입(Task1) ✓ / 영속화(Task1) ✓ / statusKind 5분류(Task1) ✓ / runMatrix 오케스트레이션·에러격리·진행률(Task2) ✓ / 페르소나 편집(Task3) ✓ / API 체크 GET 기본(Task3) ✓ / 쓰기 경고+확인(Task3) ✓ / 결과 표 색상(Task4) ✓ / 토큰 Bearer 적용·이중방지(Task5 runForPersona) ✓ / 상단바 버튼·모달(Task5) ✓
- **타입 일관성**: Persona/MatrixCell/MatrixResult/StatusKind가 permission-matrix.ts에서 정의, Modal·App에서 동일 import ✓. runMatrix(personas, opIds, runOne, onProgress?)/runForPersona(opId, token) 시그니처 일관 ✓. runOne 주입 타입 `(opId, token) => Promise<MatrixCell>` 일치 ✓
- **플레이스홀더 없음** ✓ (Task3 MatrixTable stub은 Task4에서 교체 — 의도된 점진 구현)
