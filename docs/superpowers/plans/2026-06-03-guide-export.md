# 가이드 문서 생성 Implementation Plan

> **For agentic workers:** subagent-driven-development / executing-plans. Checkbox steps.

**Goal:** 선택한 operation들의 스펙 + 히스토리 실제 예시를 묶은 Markdown 연동 가이드를 생성·복사·저장한다.

**Spec:** `docs/superpowers/specs/2026-06-03-guide-export-design.md`

작업 디렉터리: `apps/desktop`. 브랜치 main. 한국어. 재활용: `buildCurl(request: HTTPRequest)`(curl-builder), `buildRequest(baseURL, op, inputs, securityHeaders, globalHeaders, vars)→HTTPRequest`(request-builder), `defaultInputs(op)`, `isSecretHeader(key)`(core/share.ts).

---

### Task 1: core/guide-export.ts

**Files:** Create `src/core/guide-export.ts`, `src/core/guide-export.test.ts`

- [ ] **Step 1: 테스트 작성**

```ts
// src/core/guide-export.test.ts
import { describe, it, expect } from "vitest";
import { buildGuideMarkdown } from "./guide-export";
import type { ParsedSpec, ParsedOperation } from "./types";
import type { HistoryItem } from "./history";

const op: ParsedOperation = {
  id: "GET /pet/findByStatus", method: "GET", path: "/pet/findByStatus",
  summary: "Finds Pets by status.", description: "상태로 조회",
  tags: [], parameters: [{ id: "1", name: "status", location: "query", required: true, schema: { type: "string" } }],
  responses: [{ status: "200", description: "ok" } as ParsedOperation["responses"][number]],
};
const spec = { info: { title: "Petstore", version: "1" }, operations: [op], securitySchemes: [] } as unknown as ParsedSpec;

function hist(over: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: "h1", opId: "GET /pet/findByStatus", method: "GET", path: "/pet/findByStatus",
    url: "https://api.test/pet/findByStatus?status=sold", status: 200, durationMs: 10, size: 0,
    executedAt: 100,
    inputs: { pathParams: {}, queryParams: [{ key: "status", value: "sold", enabled: true }], headers: [{ key: "Authorization", value: "Bearer SECRET", enabled: true }, { key: "Accept", value: "application/json", enabled: true }], body: "" },
    responseHeaders: {}, responseBody: '[{"id":1,"name":"코코"}]',
    ...over,
  };
}

describe("buildGuideMarkdown", () => {
  it("문서 제목과 operation 섹션 헤더를 만든다", () => {
    const md = buildGuideMarkdown(spec, ["GET /pet/findByStatus"], [], "https://api.test");
    expect(md).toContain("# Petstore 연동 가이드");
    expect(md).toContain("## GET /pet/findByStatus — Finds Pets by status.");
    expect(md).toContain("상태로 조회");
  });
  it("파라미터 표를 만든다", () => {
    const md = buildGuideMarkdown(spec, ["GET /pet/findByStatus"], [], "https://api.test");
    expect(md).toContain("| status | query | 필수 | string |");
  });
  it("요청 예시 cURL을 포함하고 민감 헤더는 제외한다", () => {
    const md = buildGuideMarkdown(spec, ["GET /pet/findByStatus"], [hist()], "https://api.test");
    expect(md).toContain("curl -X GET");
    expect(md).toContain("Accept: application/json");
    expect(md).not.toContain("SECRET"); // Authorization 제외
  });
  it("응답 예시는 히스토리 responseBody를 우선 사용한다", () => {
    const md = buildGuideMarkdown(spec, ["GET /pet/findByStatus"], [hist()], "https://api.test");
    expect(md).toContain("코코");
    expect(md).toContain("**응답 예시**");
  });
  it("히스토리 없으면 응답 예시 섹션 생략(스펙 example도 없을 때)", () => {
    const md = buildGuideMarkdown(spec, ["GET /pet/findByStatus"], [], "https://api.test");
    expect(md).not.toContain("**응답 예시**");
  });
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현**

```ts
// src/core/guide-export.ts
// 스펙 + 히스토리 실제 예시 → Markdown 연동 가이드. 순수 함수.
import type { ParsedOperation, ParsedSpec } from "./types";
import type { HistoryItem } from "./history";
import { buildRequest, defaultInputs, type RequestInputs } from "./request-builder";
import { buildCurl } from "./curl-builder";
import { isSecretHeader } from "./share";

const REQUIRED_LABEL = "필수";
const OPTIONAL_LABEL = "선택";

/** 해당 opId의 최근 히스토리(executedAt 최대). 없으면 null. */
function latestHistory(history: HistoryItem[], opId: string): HistoryItem | null {
  const items = history.filter((h) => h.opId === opId);
  if (items.length === 0) return null;
  return items.reduce((a, b) => (b.executedAt > a.executedAt ? b : a));
}

/** 해당 opId의 최근 2xx 히스토리. */
function latestSuccess(history: HistoryItem[], opId: string): HistoryItem | null {
  const ok = history.filter((h) => h.opId === opId && h.status >= 200 && h.status < 300);
  if (ok.length === 0) return null;
  return ok.reduce((a, b) => (b.executedAt > a.executedAt ? b : a));
}

/** 민감 헤더를 제거한 inputs(헤더만 필터). */
function stripSecretHeaders(inputs: RequestInputs): RequestInputs {
  return { ...inputs, headers: inputs.headers.filter((h) => !isSecretHeader(h.key)) };
}

function paramTable(op: ParsedOperation): string {
  if (op.parameters.length === 0) return "";
  const rows = op.parameters
    .map((p) => `| ${p.name} | ${p.location} | ${p.required ? REQUIRED_LABEL : OPTIONAL_LABEL} | ${p.schema?.type ?? "-"} |`)
    .join("\n");
  return `**파라미터**\n\n| 이름 | 위치 | 필수 | 타입 |\n|---|---|---|---|\n${rows}\n\n`;
}

function requestExample(op: ParsedOperation, history: HistoryItem[], baseURL: string): string {
  const h = latestHistory(history, op.id);
  const inputs = h ? stripSecretHeaders(h.inputs) : defaultInputs(op);
  const req = buildRequest(baseURL, op, inputs, {}, [], {});
  return `**요청 예시**\n\n\`\`\`bash\n${buildCurl(req)}\n\`\`\`\n\n`;
}

function responseExample(op: ParsedOperation, history: HistoryItem[]): string {
  const h = latestSuccess(history, op.id);
  let body: string | undefined;
  let status = "";
  if (h) {
    status = ` (${h.status})`;
    try {
      body = JSON.stringify(JSON.parse(h.responseBody), null, 2);
    } catch {
      body = h.responseBody;
    }
  } else {
    const ok = op.responses.find((r) => r.status.startsWith("2"));
    if (ok && (ok as { example?: unknown }).example !== undefined) {
      status = ` (${ok.status})`;
      const ex = (ok as { example?: unknown }).example;
      body = typeof ex === "string" ? ex : JSON.stringify(ex, null, 2);
    }
  }
  if (body === undefined) return "";
  const lang = body.trimStart().startsWith("{") || body.trimStart().startsWith("[") ? "json" : "";
  return `**응답 예시**${status}\n\n\`\`\`${lang}\n${body}\n\`\`\`\n\n`;
}

/** operation들의 연동 가이드 Markdown 생성. */
export function buildGuideMarkdown(
  spec: ParsedSpec,
  opIds: string[],
  history: HistoryItem[],
  baseURL: string,
): string {
  const parts: string[] = [
    `# ${spec.info.title} 연동 가이드\n`,
    `> 생성: SwaggerMan · Base URL: ${baseURL}\n`,
  ];
  for (const opId of opIds) {
    const op = spec.operations.find((o) => o.id === opId);
    if (!op) continue;
    const title = op.summary ? `${op.method} ${op.path} — ${op.summary}` : `${op.method} ${op.path}`;
    parts.push(`\n## ${title}\n`);
    const desc = op.description ?? "";
    if (desc) parts.push(`${desc}\n`);
    parts.push(paramTable(op));
    parts.push(requestExample(op, history, baseURL));
    parts.push(responseExample(op, history));
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
```

- [ ] **Step 4: 통과 + 커밋** `기능: 가이드 문서 생성 코어 — 스펙+히스토리 Markdown 조립`

주의: 실제 ParsedParameter/ParsedResponse 필드명 확인(`location`/`required`/`schema`/`statusCode` vs `status`). ParsedResponse가 `statusCode`면 op.responses 비교를 그에 맞춰라(테스트 픽스처도). request-builder의 buildRequest/defaultInputs 시그니처 확인.

---

### Task 2: GuideModal + App 통합

**Files:** Create `src/components/GuideModal.tsx`, `src/components/GuideModal.test.tsx`. Modify `src/App.tsx`, `src/App.css`

- [ ] **Step 1: 테스트**

```tsx
// src/components/GuideModal.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GuideModal } from "./GuideModal";
import type { ParsedSpec, ParsedOperation } from "../core/types";

const op: ParsedOperation = {
  id: "GET /pet", method: "GET", path: "/pet", summary: "펫 목록", tags: [], parameters: [], responses: [],
};
const spec = { info: { title: "T", version: "1" }, operations: [op], securitySchemes: [] } as unknown as ParsedSpec;

const writeText = vi.fn();
beforeAll(() => Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true }));

describe("GuideModal", () => {
  it("operation 목록과 생성 버튼을 표시한다", () => {
    render(<GuideModal spec={spec} history={[]} baseURL="https://x" onSaveFile={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("/pet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "생성" })).toBeTruthy();
  });
  it("생성하면 미리보기에 Markdown이 나온다", () => {
    render(<GuideModal spec={spec} history={[]} baseURL="https://x" onSaveFile={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "생성" }));
    const ta = screen.getByLabelText("가이드 미리보기") as HTMLTextAreaElement;
    expect(ta.value).toContain("# T 연동 가이드");
  });
  it("복사 버튼이 클립보드를 호출한다", () => {
    writeText.mockClear();
    render(<GuideModal spec={spec} history={[]} baseURL="https://x" onSaveFile={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "생성" }));
    fireEvent.click(screen.getByRole("button", { name: /복사/ }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("연동 가이드"));
  });
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: GuideModal 구현**

```tsx
// src/components/GuideModal.tsx
// 가이드 문서 생성: operation 선택 → Markdown 생성 → 복사/파일 저장.
import { useState } from "react";
import type { ParsedSpec } from "../core/types";
import type { HistoryItem } from "../core/history";
import { buildGuideMarkdown } from "../core/guide-export";
import { methodColor } from "./method";
import { CloseCircleIcon, CopyIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";

interface Props {
  spec: ParsedSpec;
  history: HistoryItem[];
  baseURL: string;
  onSaveFile: (markdown: string) => void;
  onClose: () => void;
}

export function GuideModal({ spec, history, baseURL, onSaveFile, onClose }: Props) {
  useEscToClose(onClose);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(spec.operations.map((o) => o.id)));
  const [markdown, setMarkdown] = useState("");
  const [copied, setCopied] = useState(false);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const generate = () => {
    const ids = spec.operations.map((o) => o.id).filter((id) => checked.has(id));
    setMarkdown(buildGuideMarkdown(spec, ids, history, baseURL));
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal guide-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>가이드 문서 생성</h3>
          <button className="icon-btn" onClick={onClose} title="닫기"><CloseCircleIcon size={18} /></button>
        </div>
        <div className="modal-body guide-body">
          <div className="guide-ops">
            {spec.operations.map((o) => (
              <label className="guide-op-check" key={o.id}>
                <input type="checkbox" checked={checked.has(o.id)} onChange={() => toggle(o.id)} />
                <span className="method" style={{ color: methodColor(o.method) }}>{o.method}</span>
                <span className="guide-op-path">{o.path}</span>
              </label>
            ))}
          </div>
          <div className="guide-actions">
            <button className="btn small primary" disabled={checked.size === 0} onClick={generate}>생성</button>
            {markdown && (
              <>
                <button className="btn small" onClick={() => { navigator.clipboard.writeText(markdown).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {}); }}>
                  <CopyIcon size={13} /> {copied ? "복사됨" : "복사"}
                </button>
                <button className="btn small" onClick={() => onSaveFile(markdown)}>파일로 저장</button>
              </>
            )}
          </div>
          <textarea className="guide-preview" aria-label="가이드 미리보기" readOnly value={markdown}
            placeholder="operation을 선택하고 '생성'을 누르세요" spellCheck={false} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: App.tsx 통합**

import: `import { GuideModal } from "./components/GuideModal";`, `import { save } from "@tauri-apps/plugin-dialog";`, `import { writeTextFile } from "./core/fs";` (이미 있으면 재사용 — CollectionsModal이 쓰는 패턴 확인)
state: `const [guideOpen, setGuideOpen] = useState(false);`
저장 콜백:
```tsx
  async function saveGuideFile(markdown: string) {
    try {
      const path = await save({ defaultPath: "api-guide.md", filters: [{ name: "Markdown", extensions: ["md"] }] });
      if (typeof path === "string") await writeTextFile(path, markdown);
    } catch {
      /* 취소/실패 무시 */
    }
  }
```
상단바 버튼("성능" 근처): 
```tsx
        <button className="btn" title="연동 가이드 문서(Markdown) 생성" onClick={() => setGuideOpen(true)} disabled={!spec}>
          가이드
        </button>
```
모달 렌더:
```tsx
      {guideOpen && spec && (
        <GuideModal spec={spec} history={history} baseURL={baseURL} onSaveFile={saveGuideFile} onClose={() => setGuideOpen(false)} />
      )}
```
(save/writeTextFile import가 App에 없으면 추가. CollectionsModal은 자체적으로 import하므로 App엔 없을 수 있음 — 추가)

- [ ] **Step 5: App.css**

```css
/* 가이드 문서 모달 */
.modal.guide-modal { width: 720px; max-width: 94vw; height: 80vh; }
.guide-body { display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
.guide-ops { max-height: 140px; overflow: auto; border: 1px solid var(--border); border-radius: 6px; padding: 4px; }
.guide-op-check { display: flex; align-items: center; gap: 6px; padding: 3px 6px; font-size: 12px; cursor: pointer; }
.guide-op-check:hover { background: var(--bg-3); }
.guide-op-path { font-family: ui-monospace, monospace; }
.guide-actions { display: flex; gap: 8px; align-items: center; }
.guide-preview { flex: 1; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 10px; font-family: ui-monospace, monospace; font-size: 12px; resize: none; }
```

- [ ] **Step 6: 검증 + 커밋**

```
npx vitest run && npx tsc --noEmit && npx eslint src/App.tsx src/components/GuideModal.tsx src/core/guide-export.ts && npm run build 2>&1 | tail -1
```
tauri-mock.js: dialog save/fs writeTextFile가 이미 처리되는지 확인, 안되면 plugin:dialog|save → resolve(null) 케이스 추가(저장 버튼 브라우저 모드 무해).
커밋: `기능: 가이드 문서 생성 모달 + 상단바 버튼 + 파일 저장`

---

## Self-Review
- 스펙 커버리지: Markdown 조립(Task1) ✓ / 파라미터표·cURL·응답예시 우선순위·민감제외(Task1) ✓ / 모달 선택·생성·복사·저장(Task2) ✓ / 상단바 버튼(Task2) ✓
- 타입: buildGuideMarkdown(spec, opIds, history, baseURL) Task1 정의 ↔ Task2 GuideModal 호출 일치 ✓
- 플레이스홀더 없음 ✓
- 리스크: ParsedResponse status 필드명(status vs statusCode) — 구현자가 실제 types.ts 확인해 맞춤(테스트 픽스처 포함)
