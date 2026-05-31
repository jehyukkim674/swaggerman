# SwaggerMan AI 어시스턴트 M1 (채팅 패널) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 OpenAPI 엔드포인트를 컨텍스트로 로컬 `claude` CLI와 대화하는 우측 패널을 추가한다 — Q&A(스트리밍)와 요청 작성 도우미(구조화 출력 → 폼 제안).

**Architecture:** Rust 백엔드(`src-tauri/src/ai.rs`)가 `tokio::process`로 `claude -p`를 실행하고, 대화는 `tauri::ipc::Channel`로 토큰을 스트리밍한다. 프론트는 `core/ai/`에 순수 로직(컨텍스트 조립·스키마 검증·모델 정책)과 얇은 어댑터(`claude.ts`)를 두고, `components/AiPanel.tsx`(우측 패널)·`AiSuggestionCard.tsx`(폼 제안 diff)가 UI를 담당한다. AI는 제안만 만들고 HTTP 실행은 언제나 사람이 한다.

**Tech Stack:** Tauri 2 (Rust, tokio, serde) · React 19 + TypeScript · Vite · Vitest · `@testing-library/react`(컴포넌트 테스트, Task 0에서 도입) · `@tauri-apps/api/core`(invoke/Channel) · 로컬 `claude` CLI(headless `-p`, `--output-format stream-json|json`, `--json-schema`).

**관련 spec:** `docs/superpowers/specs/2026-05-31-ai-assistant-design.md`

**브랜치:** `feat/ai-assistant` (이미 생성됨, spec 커밋 포함)

---

## 사전 사실 (executor가 알아야 할 코드베이스 컨텍스트)

- 작업 루트: 모든 명령은 `apps/desktop`에서 실행한다(예: `cd apps/desktop && npm test`).
- 프론트 테스트: `npx vitest run <파일>` (단일) / `npm test` (전체). 테스트 헤더는
  명시적 `import { describe, it, expect } from "vitest";`(globals 미설정). 기본 테스트
  환경은 node이며 **jsdom은 설치돼 있지 않다** → 컴포넌트 테스트는 Task 0에서 도입.
- Rust 테스트: `cd apps/desktop/src-tauri && cargo test`. lib.rs에 이미
  `#[cfg(test)] mod tests`가 있고, `OnceLock`로 전역 상태를 만드는 선례가 있다
  (`COOKIE_STORE`). `serde`/`serde_json`은 본 의존성에 있다. **단, `tokio`는 현재
  `[dev-dependencies]`에만 `features=["macros","rt"]`로 있다** — `tokio::process`/
  `tokio::io`를 쓰려면 Task 7에서 `[dependencies]`에 tokio를 추가해야 한다(아래).
- 린트/타입: `npm run lint`, `npm run build`(tsc && vite build).
- Rust 커맨드 호출 규약(기존): 프론트 `invoke<T>("name", { args: {...} })`,
  Rust 구조체는 `#[serde(rename_all = "camelCase")]`. 반환도 camelCase.
- `RequestInputs`(`core/request-builder.ts`, 실제 정의): `pathParams: Record<string,string>`,
  `queryParams: RequestParam[]`, `headers: RequestParam[]`, `body: string`,
  `bodyMode?: "none"|"raw"|"urlencoded"|"multipart"`(없으면 raw), `form?: FormField[]`.
  `RequestParam = { key; value; enabled }`. **`useMultipart` 같은 필드는 없다** —
  제안 적용은 pathParams/queryParams/headers/body만 건드리고 나머지는 그대로 둔다.
- 컴포넌트 테스트 인프라는 현재 **없다**(기존 테스트는 전부 `core/*.test.ts` 순수
  함수, node 환경). 컴포넌트 테스트는 Task 0에서 `@testing-library/react`+jsdom을
  도입하고, 각 컴포넌트 테스트 파일 상단에 `// @vitest-environment jsdom` 도크블록을
  붙여 그 파일만 jsdom으로 돌린다(core 테스트는 node 유지).
- `loadJSON/saveJSON`(`core/storage.ts`)는 `"swaggerman."` 접두 자동 부여.
- `log`(`core/log.ts`): `log.info(tag, msg)` 등.
- 커밋 메시지는 저장소 관례(한국어): `기능:`, `개선:`, `버그수정:`, `문서:`, `테스트:`.

## 파일 구조 (M1)

**Rust (신규/수정)**
- Create `src-tauri/src/ai.rs` — AI 커맨드 + 순수 헬퍼(인자 조립/스트림 파싱/실행파일 탐지/취소 레지스트리).
- Modify `src-tauri/src/lib.rs` — `mod ai;` 추가, `invoke_handler`에 AI 커맨드 등록.

**프론트 코어 (`src/core/ai/`, 전부 신규)**
- `types.ts` — 공유 타입(`AiEvent`, `AiChatRequest`, `AiCompleteRequest`, `RequestSuggestion`, `AiDetect`, `CliInfo`).
- `context.ts` — `buildAiContext(...)` 순수 함수. + `context.test.ts`.
- `schema.ts` — `requestSuggestionSchema`, `parseSuggestion`, `applySuggestion`. + `schema.test.ts`.
- `models.ts` — 모델 목록/기본값/작업별 정책. + `models.test.ts`.
- `claude.ts` — `AiProvider` claude 구현(invoke/Channel 어댑터). + `claude.test.ts`(tauri mock).
- `provider.ts` — `AiProvider` 인터페이스 + `getProvider()` 레지스트리.

**프론트 UI (`src/components/`)**
- Create `AiSuggestionCard.tsx` — 폼 제안 diff + 적용. + `AiSuggestionCard.test.tsx`.
- Create `AiPanel.tsx` — 채팅 패널. + `AiPanel.test.tsx`.
- Modify `App.tsx` — 4번째 패널 토글, 컨텍스트 조립, 제안 적용.
- Modify `App.css` — 패널/메시지/카드 스타일.

> M2(자동완성: 인라인 ghost text ⌘. + 필드별 ✦ 제안)는 본 계획 범위 밖이며, M1
> 검증(특히 `claude` stream-json 실측·`--json-schema` 동작 확인) 후 별도 계획으로
> 작성한다. M1에서 만든 `ai_complete`/`schema.ts`/`provider.ts`를 그대로 재사용한다.

---

## Task 0: 컴포넌트 테스트 인프라 (jsdom + testing-library)

Task 9/10의 컴포넌트 테스트가 돌아가도록 RTL+jsdom을 설치한다. 전역 vitest 설정은
바꾸지 않고, 컴포넌트 테스트 파일에만 도크블록으로 jsdom을 지정한다(기존 core 순수
테스트는 node 환경 유지).

**Files:**
- Modify: `apps/desktop/package.json` (+ `package-lock.json`)
- (임시) Create/Delete: `apps/desktop/src/components/_smoke.test.tsx`

- [ ] **Step 1: 의존성 설치**

Run: `cd apps/desktop && npm i -D @testing-library/react @testing-library/dom jsdom`
Expected: 설치 성공, devDependencies에 3개 추가.

- [ ] **Step 2: 임시 스모크 테스트로 인프라 검증**

Create `apps/desktop/src/components/_smoke.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

describe("test infra", () => {
  it("jsdom + RTL로 컴포넌트를 렌더한다", () => {
    render(<button>안녕</button>);
    expect(screen.getByText("안녕")).toBeTruthy();
  });
});
```

- [ ] **Step 3: 스모크 테스트 실행 후 삭제**

Run: `cd apps/desktop && npx vitest run src/components/_smoke.test.tsx`
Expected: PASS (1 test). 통과하면 인프라 정상.

Run: `rm apps/desktop/src/components/_smoke.test.tsx`

- [ ] **Step 4: 기존 테스트 회귀 없음 확인**

Run: `cd apps/desktop && npm test`
Expected: 기존 core 테스트 전부 PASS(환경 변경 영향 없음).

- [ ] **Step 5: 커밋**

```bash
cd apps/desktop && git add package.json package-lock.json
git commit -m "테스트: 컴포넌트 테스트 인프라(@testing-library/react + jsdom)"
```

---

## Task 1: 프론트 공유 타입 (`core/ai/types.ts`)

순수 타입 선언 파일이라 런타임 테스트는 없고 `tsc`로 검증한다. 이후 모든 태스크가
이 타입을 참조한다.

**Files:**
- Create: `apps/desktop/src/core/ai/types.ts`

- [ ] **Step 1: 타입 파일 작성**

```ts
// AI 어시스턴트 공유 타입. Rust(ai.rs)의 serde(camelCase) 출력과 1:1로 맞춘다.

/** Rust ai_chat이 Channel로 보내는 스트리밍 이벤트. */
export type AiEvent =
  | { kind: "delta"; text: string }
  | { kind: "done"; sessionId?: string }
  | { kind: "error"; message: string };

/** ai_chat 호출 인자(프론트 → Rust). */
export interface AiChatRequest {
  reqId: number; // 취소(ai_cancel)에 쓰는 요청 식별자
  prompt: string; // 컨텍스트 + 사용자 질문(stdin으로 전달됨)
  system: string; // 짧은 역할 지시(--append-system-prompt)
  model: string;
  sessionId?: string; // 있으면 --resume, 없으면 새 세션
  claudePath?: string; // 설정에서 수동 지정한 실행파일 경로
}

/** ai_complete 호출 인자(프론트 → Rust). 단발 구조화 출력. */
export interface AiCompleteRequest {
  prompt: string;
  system: string;
  model: string;
  schema: string; // JSON Schema 문자열(--json-schema)
  claudePath?: string;
}

/** 요청 작성 도우미가 생성하는 폼 제안(스키마로 강제되는 형태). */
export interface RequestSuggestion {
  pathParams?: Record<string, string>;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
  notes?: string;
}

export interface CliInfo {
  path: string;
  version: string;
}

/** ai_detect 반환: 사용 가능한 CLI 정보. */
export interface AiDetect {
  claude?: CliInfo;
  codex?: CliInfo;
}
```

- [ ] **Step 2: 타입 검증**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: 에러 없음(0 exit). (기존 코드의 무관한 에러가 없다면 통과.)

- [ ] **Step 3: 커밋**

```bash
cd apps/desktop && git add src/core/ai/types.ts
git commit -m "기능: AI 어시스턴트 공유 타입(core/ai/types)"
```

---

## Task 2: 컨텍스트 조립 (`core/ai/context.ts`)

현재 엔드포인트·폼·환경변수명·직전 응답을 claude에 줄 텍스트로 만든다. 순수 함수.
**비밀값 금지**: 환경변수는 이름만, 값은 절대 넣지 않는다.

**Files:**
- Create: `apps/desktop/src/core/ai/context.ts`
- Test: `apps/desktop/src/core/ai/context.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, it, expect } from "vitest";
import { buildAiContext } from "./context";
import type { ParsedOperation, HTTPResponse } from "../types";

const op: ParsedOperation = {
  id: "POST /products",
  method: "POST",
  path: "/products",
  operationId: "createProduct",
  summary: "상품 생성",
  description: "새 상품을 등록한다",
  tags: ["product"],
  parameters: [
    { id: "q1", name: "dryRun", location: "query", required: false, schema: { type: "boolean" } },
  ],
  requestBody: {
    required: true,
    contentType: "application/json",
    schema: {
      type: "object",
      properties: { name: { type: "string" }, stock: { type: "integer" } },
      required: ["name"],
    },
  },
  responses: [{ statusCode: "201", description: "생성됨" }],
};

describe("buildAiContext", () => {
  it("엔드포인트 메서드/경로/요약을 포함한다", () => {
    const ctx = buildAiContext({ op, inputs: null, response: null, envVarNames: [], baseURL: "https://api.x" });
    expect(ctx).toContain("POST /products");
    expect(ctx).toContain("상품 생성");
    expect(ctx).toContain("https://api.x");
  });

  it("요청 스키마(필드명/필수)를 포함한다", () => {
    const ctx = buildAiContext({ op, inputs: null, response: null, envVarNames: [], baseURL: "" });
    expect(ctx).toContain("name");
    expect(ctx).toContain("stock");
  });

  it("환경변수는 이름만 넣고 값은 넣지 않는다", () => {
    const ctx = buildAiContext({
      op,
      inputs: null,
      response: null,
      envVarNames: ["TOKEN", "USER_ID"],
      baseURL: "",
    });
    expect(ctx).toContain("TOKEN");
    expect(ctx).toContain("USER_ID");
    expect(ctx).not.toContain("secret-value");
  });

  it("직전 응답이 있으면 상태코드와 본문 일부를 포함한다", () => {
    const response: HTTPResponse = {
      statusCode: 401,
      headers: {},
      body: '{"error":"unauthorized"}',
      durationMs: 12,
      size: 24,
    };
    const ctx = buildAiContext({ op, inputs: null, response, envVarNames: [], baseURL: "" });
    expect(ctx).toContain("401");
    expect(ctx).toContain("unauthorized");
  });

  it("매우 긴 응답 본문은 잘라낸다(2000자 이하)", () => {
    const response: HTTPResponse = {
      statusCode: 200,
      headers: {},
      body: "x".repeat(5000),
      durationMs: 1,
      size: 5000,
    };
    const ctx = buildAiContext({ op, inputs: null, response, envVarNames: [], baseURL: "" });
    expect(ctx.length).toBeLessThan(4000);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/desktop && npx vitest run src/core/ai/context.test.ts`
Expected: FAIL — `buildAiContext` 없음(모듈 해석 실패).

- [ ] **Step 3: 최소 구현 작성**

```ts
import type { HTTPResponse, ParsedOperation, ParsedSchema } from "../types";
import type { RequestInputs } from "../request-builder";

interface ContextArgs {
  op: ParsedOperation;
  inputs: RequestInputs | null;
  response: HTTPResponse | null;
  envVarNames: string[];
  baseURL: string;
}

const MAX_BODY = 2000;

function schemaOutline(schema: ParsedSchema | undefined, depth = 0): string {
  if (!schema || depth > 4) return "";
  if (schema.type === "object" && schema.properties) {
    const req = new Set(schema.required ?? []);
    const lines = Object.entries(schema.properties).map(([k, sub]) => {
      const mark = req.has(k) ? "*" : "";
      const t = sub.type ?? "unknown";
      return `${"  ".repeat(depth + 1)}- ${k}${mark}: ${t}`;
    });
    return lines.join("\n");
  }
  if (schema.type === "array") return `${"  ".repeat(depth + 1)}- [array of ${schema.items?.type ?? "unknown"}]`;
  return "";
}

/** 현재 엔드포인트/폼/환경/직전 응답을 claude용 컨텍스트 블록으로 조립한다(순수). */
export function buildAiContext(args: ContextArgs): string {
  const { op, inputs, response, envVarNames, baseURL } = args;
  const parts: string[] = [];

  parts.push("## 현재 엔드포인트");
  parts.push(`${op.method} ${op.path}`);
  if (op.summary) parts.push(`요약: ${op.summary}`);
  if (op.description) parts.push(`설명: ${op.description}`);
  if (baseURL) parts.push(`Base URL: ${baseURL}`);

  if (op.parameters.length > 0) {
    parts.push("\n## 파라미터");
    for (const p of op.parameters) {
      const mark = p.required ? "*" : "";
      parts.push(`- (${p.location}) ${p.name}${mark}: ${p.schema?.type ?? "string"}`);
    }
  }

  if (op.requestBody?.schema) {
    parts.push(`\n## 요청 본문(${op.requestBody.contentType})`);
    const outline = schemaOutline(op.requestBody.schema);
    if (outline) parts.push(outline);
  }

  if (inputs) {
    parts.push("\n## 현재 폼 상태");
    parts.push(`pathParams: ${JSON.stringify(inputs.pathParams)}`);
    const q = inputs.queryParams.filter((x) => x.enabled && x.key).map((x) => `${x.key}=${x.value}`);
    if (q.length) parts.push(`query: ${q.join("&")}`);
    if (inputs.body) parts.push(`body:\n${inputs.body.slice(0, MAX_BODY)}`);
  }

  if (envVarNames.length > 0) {
    parts.push("\n## 사용 가능한 환경 변수(이름만, 값은 비공개)");
    parts.push(envVarNames.map((n) => `{{${n}}}`).join(", "));
  }

  if (response) {
    parts.push("\n## 직전 응답");
    parts.push(`status: ${response.statusCode} (${response.durationMs}ms)`);
    const body = response.body.slice(0, MAX_BODY);
    parts.push(`body:\n${body}${response.body.length > MAX_BODY ? "\n…(생략)" : ""}`);
  }

  return parts.join("\n");
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/desktop && npx vitest run src/core/ai/context.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
cd apps/desktop && git add src/core/ai/context.ts src/core/ai/context.test.ts
git commit -m "기능: AI 컨텍스트 조립(엔드포인트/폼/응답, 비밀값 제외)"
```

---

## Task 3: 요청 제안 스키마·검증·적용 (`core/ai/schema.ts`)

요청 작성 도우미의 핵심. JSON Schema 정의 + claude 출력 파싱(래퍼 허용) + 현재
`RequestInputs`에 안전 병합. 순수 함수.

**Files:**
- Create: `apps/desktop/src/core/ai/schema.ts`
- Test: `apps/desktop/src/core/ai/schema.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, it, expect } from "vitest";
import { requestSuggestionSchema, parseSuggestion, applySuggestion } from "./schema";
import type { RequestInputs } from "../request-builder";

function emptyInputs(): RequestInputs {
  return {
    pathParams: { id: "" },
    queryParams: [{ key: "dryRun", value: "", enabled: false }],
    headers: [],
    body: "",
    bodyMode: "raw",
    form: [],
  };
}

describe("requestSuggestionSchema", () => {
  it("object 타입이고 알려진 속성을 가진다", () => {
    expect(requestSuggestionSchema.type).toBe("object");
    expect(requestSuggestionSchema.properties).toHaveProperty("body");
    expect(requestSuggestionSchema.properties).toHaveProperty("queryParams");
  });
});

describe("parseSuggestion", () => {
  it("순수 제안 JSON을 파싱한다", () => {
    const raw = JSON.stringify({ body: '{"name":"a"}', notes: "ok" });
    expect(parseSuggestion(raw)).toEqual({ body: '{"name":"a"}', notes: "ok" });
  });

  it("claude json 래퍼({result})를 벗겨낸다", () => {
    const inner = { body: '{"x":1}' };
    const raw = JSON.stringify({ type: "result", result: JSON.stringify(inner) });
    expect(parseSuggestion(raw)).toEqual(inner);
  });

  it("result가 객체인 래퍼도 처리한다", () => {
    const inner = { headers: { "X-A": "1" } };
    const raw = JSON.stringify({ result: inner });
    expect(parseSuggestion(raw)).toEqual(inner);
  });

  it("파싱 불가하면 null", () => {
    expect(parseSuggestion("not json")).toBeNull();
  });

  it("알 수 없는 필드는 버린다", () => {
    const raw = JSON.stringify({ body: "{}", hacker: "rm -rf", method: "DELETE" });
    expect(parseSuggestion(raw)).toEqual({ body: "{}" });
  });
});

describe("applySuggestion", () => {
  it("pathParams를 병합한다", () => {
    const out = applySuggestion(emptyInputs(), { pathParams: { id: "42" } });
    expect(out.pathParams.id).toBe("42");
  });

  it("기존 query 키는 값 갱신+활성화, 새 키는 추가한다", () => {
    const out = applySuggestion(emptyInputs(), { queryParams: { dryRun: "true", page: "2" } });
    const dry = out.queryParams.find((q) => q.key === "dryRun")!;
    expect(dry.value).toBe("true");
    expect(dry.enabled).toBe(true);
    expect(out.queryParams.find((q) => q.key === "page")?.value).toBe("2");
  });

  it("headers를 upsert한다", () => {
    const out = applySuggestion(emptyInputs(), { headers: { "X-Trace": "abc" } });
    expect(out.headers.find((h) => h.key === "X-Trace")?.value).toBe("abc");
  });

  it("body를 교체한다", () => {
    const out = applySuggestion(emptyInputs(), { body: '{"name":"hi"}' });
    expect(out.body).toBe('{"name":"hi"}');
  });

  it("원본을 변형하지 않는다(불변)", () => {
    const input = emptyInputs();
    applySuggestion(input, { body: "changed" });
    expect(input.body).toBe("");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/desktop && npx vitest run src/core/ai/schema.test.ts`
Expected: FAIL — 모듈/함수 없음.

- [ ] **Step 3: 최소 구현 작성**

```ts
import type { RequestInputs, RequestParam } from "../request-builder";
import type { RequestSuggestion } from "./types";

/** claude --json-schema 로 강제할 요청 제안 스키마. */
export const requestSuggestionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    pathParams: { type: "object", additionalProperties: { type: "string" } },
    queryParams: { type: "object", additionalProperties: { type: "string" } },
    headers: { type: "object", additionalProperties: { type: "string" } },
    body: { type: "string" },
    notes: { type: "string" },
  },
} as const;

const KNOWN_KEYS: (keyof RequestSuggestion)[] = ["pathParams", "queryParams", "headers", "body", "notes"];

function pickKnown(obj: Record<string, unknown>): RequestSuggestion {
  const out: RequestSuggestion = {};
  for (const k of KNOWN_KEYS) {
    const v = obj[k];
    if (v === undefined) continue;
    if (k === "body" || k === "notes") {
      if (typeof v === "string") out[k] = v;
    } else if (typeof v === "object" && v !== null) {
      const rec: Record<string, string> = {};
      for (const [kk, vv] of Object.entries(v as Record<string, unknown>)) {
        rec[kk] = typeof vv === "string" ? vv : String(vv);
      }
      out[k] = rec;
    }
  }
  return out;
}

/** claude 출력(순수 제안 또는 {result} 래퍼)을 RequestSuggestion으로 파싱. 실패 시 null. */
export function parseSuggestion(raw: string): RequestSuggestion | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  // claude json 래퍼 벗기기
  if ("result" in obj) {
    const r = obj.result;
    if (typeof r === "string") {
      try {
        const inner = JSON.parse(r);
        if (typeof inner === "object" && inner !== null) return pickKnown(inner as Record<string, unknown>);
      } catch {
        return null;
      }
    } else if (typeof r === "object" && r !== null) {
      return pickKnown(r as Record<string, unknown>);
    }
    return null;
  }
  return pickKnown(obj);
}

function upsert(list: RequestParam[], rec: Record<string, string>): RequestParam[] {
  const out = list.map((p) => ({ ...p }));
  for (const [key, value] of Object.entries(rec)) {
    const existing = out.find((p) => p.key === key);
    if (existing) {
      existing.value = value;
      existing.enabled = true;
    } else {
      out.push({ key, value, enabled: true });
    }
  }
  return out;
}

/** 제안을 현재 입력에 불변 병합한다(pathParams/query/headers/body만; 나머지 유지). */
export function applySuggestion(inputs: RequestInputs, s: RequestSuggestion): RequestInputs {
  return {
    ...inputs,
    pathParams: s.pathParams ? { ...inputs.pathParams, ...s.pathParams } : inputs.pathParams,
    queryParams: s.queryParams ? upsert(inputs.queryParams, s.queryParams) : inputs.queryParams,
    headers: s.headers ? upsert(inputs.headers, s.headers) : inputs.headers,
    body: s.body !== undefined ? s.body : inputs.body,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/desktop && npx vitest run src/core/ai/schema.test.ts`
Expected: PASS (전체).

- [ ] **Step 5: 커밋**

```bash
cd apps/desktop && git add src/core/ai/schema.ts src/core/ai/schema.test.ts
git commit -m "기능: 요청 제안 스키마/파싱/폼 병합(core/ai/schema)"
```

---

## Task 4: 모델 정책 (`core/ai/models.ts`)

대화 vs 자동완성에 쓸 모델 목록과 기본값. 순수.

**Files:**
- Create: `apps/desktop/src/core/ai/models.ts`
- Test: `apps/desktop/src/core/ai/models.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, it, expect } from "vitest";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, COMPLETE_MODEL } from "./models";

describe("models", () => {
  it("대화 모델 목록은 비어있지 않다", () => {
    expect(CHAT_MODELS.length).toBeGreaterThan(0);
  });
  it("기본 대화 모델은 목록에 있다", () => {
    expect(CHAT_MODELS.map((m) => m.id)).toContain(DEFAULT_CHAT_MODEL);
  });
  it("자동완성 모델은 빠른 모델(haiku)이다", () => {
    expect(COMPLETE_MODEL).toContain("haiku");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/desktop && npx vitest run src/core/ai/models.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현 작성**

```ts
// claude CLI는 별칭(alias)을 받는다(예: "opus","sonnet","haiku"). 별칭을 기본값으로.
export interface ModelOption {
  id: string;
  label: string;
}

export const CHAT_MODELS: ModelOption[] = [
  { id: "sonnet", label: "Sonnet (균형)" },
  { id: "opus", label: "Opus (고성능)" },
  { id: "haiku", label: "Haiku (빠름)" },
];

export const DEFAULT_CHAT_MODEL = "sonnet";

/** 요청 작성 도우미/자동완성은 지연 민감 → 빠른 모델. */
export const COMPLETE_MODEL = "haiku";
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/desktop && npx vitest run src/core/ai/models.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
cd apps/desktop && git add src/core/ai/models.ts src/core/ai/models.test.ts
git commit -m "기능: AI 모델 정책(대화 sonnet, 자동완성 haiku)"
```

---

## Task 5: Rust 순수 헬퍼 — 인자 조립 (`ai.rs` 1/3)

claude 실행 인자를 만드는 순수 함수부터. 가장 깨지기 쉬운 부분이라 단위 테스트로
고정한다.

> 참고: 이 Task와 Task 6의 `ai.rs`는 `serde`/`serde_json`/`std`만 쓰므로 tokio 본
> 의존성 없이 컴파일된다. tokio 본 의존성은 비동기 커맨드가 등장하는 **Task 7
> Step 0**에서 추가한다.

**Files:**
- Create: `apps/desktop/src-tauri/src/ai.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (모듈 등록만)

- [ ] **Step 1: lib.rs에 모듈 선언 추가**

`src-tauri/src/lib.rs` 최상단(파일 첫 `use` 위)에 추가:

```rust
mod ai;
```

- [ ] **Step 2: ai.rs에 헬퍼 + 실패하는 테스트 작성**

`src-tauri/src/ai.rs` 생성:

```rust
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatArgs {
    pub req_id: u32,
    pub prompt: String,
    pub system: String,
    pub model: String,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub claude_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCompleteArgs {
    pub prompt: String,
    pub system: String,
    pub model: String,
    pub schema: String,
    #[serde(default)]
    pub claude_path: Option<String>,
}

// tag="kind"로 변환되고, variant 이름과 내부 필드 모두 camelCase로 직렬화한다.
// (rename_all은 variant 이름만 바꾸므로, session_id→sessionId를 위해
//  rename_all_fields가 필요하다. serde 1.0.157+.) TS AiEvent와 1:1로 맞춘다.
#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum AiEvent {
    Delta { text: String },
    Done { session_id: Option<String> },
    Error { message: String },
}

/// 대화용 claude 인자(stream-json 스트리밍). prompt는 stdin으로 주므로 인자에 없다.
pub fn build_chat_args(a: &AiChatArgs) -> Vec<String> {
    let mut v = vec![
        "-p".into(),
        "--output-format".into(),
        "stream-json".into(),
        "--include-partial-messages".into(),
        "--verbose".into(),
        "--model".into(),
        a.model.clone(),
        "--append-system-prompt".into(),
        a.system.clone(),
    ];
    match &a.session_id {
        Some(id) if !id.is_empty() => {
            v.push("--resume".into());
            v.push(id.clone());
        }
        _ => {}
    }
    v
}

/// 단발 구조화 출력용 claude 인자. prompt는 stdin.
pub fn build_complete_args(a: &AiCompleteArgs) -> Vec<String> {
    vec![
        "-p".into(),
        "--output-format".into(),
        "json".into(),
        "--model".into(),
        a.model.clone(),
        "--json-schema".into(),
        a.schema.clone(),
        "--append-system-prompt".into(),
        a.system.clone(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chat_args(session: Option<&str>) -> AiChatArgs {
        AiChatArgs {
            req_id: 1,
            prompt: "q".into(),
            system: "sys".into(),
            model: "sonnet".into(),
            session_id: session.map(|s| s.to_string()),
            claude_path: None,
        }
    }

    #[test]
    fn chat_args_include_stream_json_and_model() {
        let v = build_chat_args(&chat_args(None));
        assert!(v.contains(&"stream-json".to_string()));
        assert!(v.contains(&"sonnet".to_string()));
        assert!(v.windows(2).any(|w| w[0] == "--model" && w[1] == "sonnet"));
        // 세션 없으면 --resume 없음
        assert!(!v.contains(&"--resume".to_string()));
    }

    #[test]
    fn chat_args_resume_when_session_present() {
        let v = build_chat_args(&chat_args(Some("sess-123")));
        assert!(v.windows(2).any(|w| w[0] == "--resume" && w[1] == "sess-123"));
    }

    #[test]
    fn complete_args_include_json_schema() {
        let a = AiCompleteArgs {
            prompt: "q".into(),
            system: "sys".into(),
            model: "haiku".into(),
            schema: "{\"type\":\"object\"}".into(),
            claude_path: None,
        };
        let v = build_complete_args(&a);
        assert!(v.windows(2).any(|w| w[0] == "--json-schema" && w[1] == "{\"type\":\"object\"}"));
        assert!(v.windows(2).any(|w| w[0] == "--output-format" && w[1] == "json"));
    }
}
```

- [ ] **Step 3: 테스트 실패→통과 확인**

Run: `cd apps/desktop/src-tauri && cargo test ai::tests::`
Expected: 컴파일 후 3 tests PASS. (이 단계에서 lib.rs `mod ai;`로 컴파일되어야 함.
`AiEvent`/`AiChatArgs` 미사용 경고는 다음 태스크에서 해소되므로 무시.)

- [ ] **Step 4: 커밋**

```bash
cd apps/desktop && git add src-tauri/src/ai.rs src-tauri/src/lib.rs
git commit -m "기능: Rust AI 인자 조립 헬퍼(build_chat_args/build_complete_args)"
```

---

## Task 6: Rust 순수 헬퍼 — 스트림 파싱 & 실행파일 탐지 (`ai.rs` 2/3)

claude stream-json 한 줄을 `AiEvent`로 바꾸는 파서와, 실행파일 후보 선택 헬퍼.

**Files:**
- Modify: `apps/desktop/src-tauri/src/ai.rs`

- [ ] **Step 1: 파서/탐지 헬퍼 + 실패 테스트 추가**

`ai.rs`의 `build_complete_args` 아래(테스트 모듈 위)에 추가:

```rust
use serde_json::Value;

/// claude stream-json 한 줄을 AiEvent로 변환. 무관한 라인은 None.
/// 규칙: partial 텍스트 델타(stream_event/content_block_delta)만 Delta로,
/// 최종 result는 Done(session_id), result.is_error는 Error로 매핑한다.
/// (전체 assistant 메시지 라인은 partial과 중복되므로 무시.)
pub fn parse_stream_line(line: &str) -> Option<AiEvent> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    let v: Value = serde_json::from_str(line).ok()?;
    let t = v.get("type")?.as_str()?;
    match t {
        "stream_event" => {
            let ev = v.get("event")?;
            if ev.get("type")?.as_str()? != "content_block_delta" {
                return None;
            }
            let delta = ev.get("delta")?;
            // text_delta만 취한다(thinking 등 제외)
            if delta.get("type").and_then(|x| x.as_str()) == Some("text_delta") {
                let text = delta.get("text")?.as_str()?.to_string();
                return Some(AiEvent::Delta { text });
            }
            None
        }
        "result" => {
            let is_error = v.get("is_error").and_then(|x| x.as_bool()).unwrap_or(false);
            if is_error {
                let msg = v
                    .get("result")
                    .and_then(|x| x.as_str())
                    .unwrap_or("알 수 없는 오류")
                    .to_string();
                return Some(AiEvent::Error { message: msg });
            }
            let session_id = v.get("session_id").and_then(|x| x.as_str()).map(|s| s.to_string());
            Some(AiEvent::Done { session_id })
        }
        _ => None,
    }
}

/// 후보 경로 중 실제 존재하는 첫 실행파일을 고른다.
pub fn pick_executable(candidates: &[String]) -> Option<String> {
    candidates
        .iter()
        .find(|p| !p.is_empty() && std::path::Path::new(p).is_file())
        .cloned()
}
```

그리고 `mod tests` 안에 테스트 추가:

```rust
    #[test]
    fn parse_partial_text_delta() {
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"안녕"}}}"#;
        match parse_stream_line(line) {
            Some(AiEvent::Delta { text }) => assert_eq!(text, "안녕"),
            other => panic!("expected delta, got {other:?}"),
        }
    }

    #[test]
    fn parse_result_done_with_session() {
        let line = r#"{"type":"result","is_error":false,"session_id":"abc","result":"hi"}"#;
        match parse_stream_line(line) {
            Some(AiEvent::Done { session_id }) => assert_eq!(session_id.as_deref(), Some("abc")),
            _ => panic!("expected done"),
        }
    }

    #[test]
    fn parse_result_error() {
        let line = r#"{"type":"result","is_error":true,"result":"boom"}"#;
        match parse_stream_line(line) {
            Some(AiEvent::Error { message }) => assert_eq!(message, "boom"),
            _ => panic!("expected error"),
        }
    }

    #[test]
    fn parse_ignores_unrelated_lines() {
        assert!(parse_stream_line(r#"{"type":"assistant","message":{}}"#).is_none());
        assert!(parse_stream_line("").is_none());
        assert!(parse_stream_line("not json").is_none());
    }

    #[test]
    fn pick_executable_returns_existing() {
        // 현재 소스 파일은 반드시 존재 → 첫 존재 경로를 고른다.
        let me = file!().to_string();
        let picked = pick_executable(&["/definitely/not/here".into(), me.clone()]);
        assert_eq!(picked, Some(me));
    }

    #[test]
    fn pick_executable_none_when_missing() {
        assert_eq!(pick_executable(&["/nope/a".into(), "/nope/b".into()]), None);
    }
```

`AiEvent`에 `Debug`를 추가한다(테스트 패닉 메시지용). 즉 Task 5의
`#[derive(Serialize, Clone)]`을 `#[derive(Serialize, Clone, Debug)]`로 바꾼다
(serde 속성 줄 `#[serde(tag = "kind", …)]`은 그대로 둔다).

- [ ] **Step 2: 테스트 통과 확인**

Run: `cd apps/desktop/src-tauri && cargo test ai::tests::`
Expected: 신규 포함 전부 PASS.

- [ ] **Step 3: 커밋**

```bash
cd apps/desktop && git add src-tauri/src/ai.rs
git commit -m "기능: Rust stream-json 파서 + 실행파일 탐지 헬퍼"
```

---

## Task 7: Rust 커맨드 — detect/complete/chat/cancel (`ai.rs` 3/3)

순수 헬퍼를 얇은 글루로 감싼 Tauri 커맨드. 글루는 mock claude 스크립트로 통합
테스트한다(`ai_complete` 경유).

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml` (tokio 본 의존성 추가)
- Modify: `apps/desktop/src-tauri/src/ai.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (핸들러 등록)

- [ ] **Step 0: Cargo.toml에 tokio 본 의존성 추가**

`ai_complete`/`ai_chat`는 `tokio::process::Command`와 `tokio::io`(AsyncBufReadExt/
AsyncWriteExt/BufReader)를 직접 쓴다. 현재 tokio는 dev-dependency에만 있으므로 본
의존성에 추가한다. `[dependencies]` 블록(예: `reqwest_cookie_store = "0.8"` 줄 아래,
`tauri-plugin-dialog` 위 아무 곳)에 추가:

```toml
tokio = { version = "1", features = ["macros", "rt", "rt-multi-thread", "process", "io-util"] }
```

> `process`는 Unix에서 `signal`(→`rt`)을 끌어오고, 자식 I/O에 `io-util`이 필요하다.
> `rt-multi-thread`/`macros`는 Task 7의 `#[tokio::test]` 통합 테스트가 프로세스를
> spawn·await 할 수 있게 한다. (기존 `[dev-dependencies]`의 tokio 줄은 그대로 둬도
> 무방하다 — 기능은 합집합으로 통합된다.)

Run: `cd apps/desktop/src-tauri && cargo build`
Expected: 의존성 해석/컴파일 성공(아직 ai.rs는 Task 6 상태라 커맨드 없음 — OK).

- [ ] **Step 1: 커맨드 구현 추가**

`ai.rs` 상단 `use` 보강 및 커맨드 추가(테스트 모듈 위):

```rust
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliInfo {
    pub path: String,
    pub version: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiDetect {
    pub claude: Option<CliInfo>,
    pub codex: Option<CliInfo>,
}

/// 취소 요청된 req_id 집합.
fn cancelled() -> &'static Mutex<HashSet<u32>> {
    static C: OnceLock<Mutex<HashSet<u32>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashSet::new()))
}

fn version_of(path: &str) -> Option<String> {
    let out = std::process::Command::new(path).arg("--version").output().ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn home() -> String {
    std::env::var("HOME").unwrap_or_default()
}

/// claude/codex 실행파일을 탐지한다(PATH 우선, 알려진 후보 보강).
#[tauri::command]
pub fn ai_detect() -> AiDetect {
    let mut d = AiDetect::default();

    let mut claude_candidates: Vec<String> = vec![];
    if let Ok(p) = which("claude") {
        claude_candidates.push(p);
    }
    claude_candidates.push(format!("{}/.claude/local/claude", home()));
    if let Some(path) = pick_executable(&claude_candidates) {
        if let Some(version) = version_of(&path) {
            d.claude = Some(CliInfo { path, version });
        }
    }

    let mut codex_candidates: Vec<String> = vec![];
    if let Ok(p) = which("codex") {
        codex_candidates.push(p);
    }
    codex_candidates.push("/opt/homebrew/bin/codex".into());
    if let Some(path) = pick_executable(&codex_candidates) {
        if let Some(version) = version_of(&path) {
            d.codex = Some(CliInfo { path, version });
        }
    }
    d
}

/// `which`의 최소 구현(PATH 탐색). 외부 의존성 없이.
fn which(bin: &str) -> Result<String, ()> {
    let path = std::env::var("PATH").map_err(|_| ())?;
    for dir in path.split(':') {
        let candidate = format!("{dir}/{bin}");
        if std::path::Path::new(&candidate).is_file() {
            return Ok(candidate);
        }
    }
    Err(())
}

fn resolve_claude(explicit: &Option<String>) -> Result<String, String> {
    if let Some(p) = explicit.as_ref().filter(|s| !s.is_empty()) {
        return Ok(p.clone());
    }
    ai_detect()
        .claude
        .map(|c| c.path)
        .ok_or_else(|| {
            "claude CLI를 찾을 수 없습니다. PATH에 claude가 있는지 확인하세요(예: `which claude`)."
                .to_string()
        })
}

/// 단발 구조화 출력. claude stdout(JSON 문자열)을 그대로 반환.
#[tauri::command]
pub async fn ai_complete(args: AiCompleteArgs) -> Result<String, String> {
    let bin = resolve_claude(&args.claude_path)?;
    let cli_args = build_complete_args(&args);
    let mut child = tokio::process::Command::new(&bin)
        .args(&cli_args)
        .current_dir(std::env::temp_dir())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("claude 실행 실패: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(args.prompt.as_bytes())
            .await
            .map_err(|e| format!("stdin 쓰기 실패: {e}"))?;
        drop(stdin); // EOF
    }

    let out = child.wait_with_output().await.map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!("claude 비정상 종료: {}", String::from_utf8_lossy(&out.stderr)));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/// 스트리밍 대화. stdout 라인을 파싱해 Channel로 이벤트 전송.
#[tauri::command]
pub async fn ai_chat(args: AiChatArgs, on_event: Channel<AiEvent>) -> Result<(), String> {
    let bin = resolve_claude(&args.claude_path)?;
    let req_id = args.req_id;
    let cli_args = build_chat_args(&args);

    let mut child = tokio::process::Command::new(&bin)
        .args(&cli_args)
        .current_dir(std::env::temp_dir())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("claude 실행 실패: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(args.prompt.as_bytes()).await;
        drop(stdin);
    }

    let stdout = child.stdout.take().ok_or("stdout 없음")?;
    let mut lines = BufReader::new(stdout).lines();

    loop {
        // 취소 확인
        if cancelled().lock().unwrap().remove(&req_id) {
            let _ = child.kill().await;
            break;
        }
        match lines.next_line().await {
            Ok(Some(line)) => {
                if let Some(ev) = parse_stream_line(&line) {
                    let _ = on_event.send(ev);
                }
            }
            Ok(None) => break, // EOF
            Err(e) => {
                let _ = on_event.send(AiEvent::Error { message: e.to_string() });
                break;
            }
        }
    }
    let _ = child.wait().await;
    Ok(())
}

/// 진행 중 대화를 취소한다(다음 라인 처리 시 프로세스 kill).
#[tauri::command]
pub fn ai_cancel(req_id: u32) {
    cancelled().lock().unwrap().insert(req_id);
}
```

- [ ] **Step 2: lib.rs 핸들러에 등록**

`src-tauri/src/lib.rs`의 `generate_handler!` 매크로에 AI 커맨드를 추가한다.
현재:

```rust
        .invoke_handler(tauri::generate_handler![
            http_request,
            list_cookies,
            clear_cookies,
            read_text_file,
            write_text_file
        ])
```

를 다음으로 교체:

```rust
        .invoke_handler(tauri::generate_handler![
            http_request,
            list_cookies,
            clear_cookies,
            read_text_file,
            write_text_file,
            ai::ai_detect,
            ai::ai_complete,
            ai::ai_chat,
            ai::ai_cancel
        ])
```

- [ ] **Step 3: mock claude 통합 테스트 추가**

`ai.rs`의 `mod tests`에 추가(임시 셸 스크립트를 claude 대신 실행):

```rust
    #[tokio::test]
    async fn ai_complete_pipes_stdin_and_returns_stdout() {
        // 고정 JSON을 stdout으로 내는 가짜 claude 스크립트
        let dir = std::env::temp_dir();
        let script = dir.join("fake_claude_complete.sh");
        std::fs::write(
            &script,
            "#!/bin/sh\ncat > /dev/null\nprintf '{\"result\":\"{\\\\\"body\\\\\":\\\\\"{}\\\\\"}\"}'\n",
        )
        .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let args = AiCompleteArgs {
            prompt: "만들어줘".into(),
            system: "sys".into(),
            model: "haiku".into(),
            schema: "{}".into(),
            claude_path: Some(script.to_string_lossy().to_string()),
        };
        let out = ai_complete(args).await.unwrap();
        assert!(out.contains("result"));
        let _ = std::fs::remove_file(&script);
    }
```

> 참고: 이 테스트는 Unix 셸 스크립트를 사용한다(macOS/Linux). Windows CI에서는
> `#[cfg(unix)]`로 테스트 자체를 게이트해도 된다 — 본 프로젝트 주 타깃은 macOS다.
> 필요 시 테스트 함수에 `#[cfg(unix)]`를 붙인다.
>
> **테스트 경계:** `ai_complete`는 `Channel`을 안 쓰므로 위처럼 mock claude로 통합
> 테스트한다. 반면 `ai_chat`의 스트리밍/취소 글루는 `tauri::ipc::Channel`을 인자로
> 받는데, 이 타입은 webview/IPC 런타임 없이는 cargo 테스트에서 생성하기 어렵다.
> 따라서 `ai_chat`의 **파싱 로직은 순수 함수 `parse_stream_line`로 분리해 Task 6에서
> 단위 테스트**하고, spawn→스트리밍→kill의 얇은 I/O 글루는 Task 13의 E2E(수동)에서
> 검증한다. 이 경계는 의도된 것이다(스펙 §7의 현실적 적용).

- [ ] **Step 4: 빌드 & 테스트**

Run: `cd apps/desktop/src-tauri && cargo test ai::`
Expected: 순수 헬퍼 테스트 + `ai_complete_pipes_stdin_and_returns_stdout` PASS.

Run: `cd apps/desktop/src-tauri && cargo build`
Expected: 컴파일 성공(경고는 허용).

- [ ] **Step 5: 커밋**

```bash
cd apps/desktop && git add src-tauri/src/ai.rs src-tauri/src/lib.rs
git commit -m "기능: Rust AI 커맨드(detect/complete/chat 스트리밍/cancel)"
```

---

## Task 8: claude 어댑터 & provider 레지스트리 (`core/ai/claude.ts`, `provider.ts`)

Rust 커맨드를 감싸는 얇은 어댑터. `@tauri-apps/api/core`를 mock해 호출 규약을
검증한다.

**Files:**
- Create: `apps/desktop/src/core/ai/provider.ts`
- Create: `apps/desktop/src/core/ai/claude.ts`
- Test: `apps/desktop/src/core/ai/claude.test.ts`

- [ ] **Step 1: provider 인터페이스 작성**

`provider.ts`:

```ts
import type { AiChatRequest, AiCompleteRequest, AiEvent, AiDetect } from "./types";

export interface AiHandle {
  cancel: () => void;
}

export interface AiProvider {
  id: "claude" | "codex";
  displayName: string;
  detect: () => Promise<AiDetect>;
  chat: (req: AiChatRequest, onEvent: (e: AiEvent) => void) => AiHandle;
  complete: (req: AiCompleteRequest) => Promise<string>;
}
```

- [ ] **Step 2: 실패하는 어댑터 테스트 작성**

`claude.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
class FakeChannel {
  onmessage: ((e: unknown) => void) | null = null;
}
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  Channel: FakeChannel,
}));

import { claudeProvider } from "./claude";

beforeEach(() => invokeMock.mockReset());

describe("claudeProvider", () => {
  it("complete는 ai_complete를 올바른 인자로 호출한다", async () => {
    invokeMock.mockResolvedValue('{"result":"{}"}');
    const out = await claudeProvider.complete({
      prompt: "p",
      system: "s",
      model: "haiku",
      schema: "{}",
    });
    expect(out).toBe('{"result":"{}"}');
    expect(invokeMock).toHaveBeenCalledWith("ai_complete", {
      args: { prompt: "p", system: "s", model: "haiku", schema: "{}", claudePath: undefined },
    });
  });

  it("detect는 ai_detect를 호출한다", async () => {
    invokeMock.mockResolvedValue({ claude: { path: "/x", version: "v" } });
    const d = await claudeProvider.detect();
    expect(d.claude?.path).toBe("/x");
    expect(invokeMock).toHaveBeenCalledWith("ai_detect");
  });

  it("chat은 ai_chat 호출 + Channel 이벤트를 콜백으로 전달한다", () => {
    invokeMock.mockResolvedValue(undefined);
    const events: unknown[] = [];
    claudeProvider.chat(
      { reqId: 7, prompt: "p", system: "s", model: "sonnet" },
      (e) => events.push(e),
    );
    // invoke 호출 확인
    expect(invokeMock).toHaveBeenCalled();
    const [name, payload] = invokeMock.mock.calls[0];
    expect(name).toBe("ai_chat");
    // Channel을 통해 들어온 메시지를 onEvent로 전달하는지
    const ch = (payload as { onEvent: FakeChannel }).onEvent;
    ch.onmessage?.({ kind: "delta", text: "hi" });
    expect(events).toEqual([{ kind: "delta", text: "hi" }]);
  });

  it("chat 핸들 cancel은 ai_cancel을 호출한다", () => {
    invokeMock.mockResolvedValue(undefined);
    const handle = claudeProvider.chat(
      { reqId: 9, prompt: "p", system: "s", model: "sonnet" },
      () => {},
    );
    handle.cancel();
    expect(invokeMock).toHaveBeenCalledWith("ai_cancel", { reqId: 9 });
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd apps/desktop && npx vitest run src/core/ai/claude.test.ts`
Expected: FAIL — `claudeProvider` 없음.

- [ ] **Step 4: 어댑터 구현**

`claude.ts`:

```ts
import { invoke, Channel } from "@tauri-apps/api/core";
import type { AiChatRequest, AiCompleteRequest, AiEvent, AiDetect } from "./types";
import type { AiHandle, AiProvider } from "./provider";

export const claudeProvider: AiProvider = {
  id: "claude",
  displayName: "Claude",

  async detect(): Promise<AiDetect> {
    return invoke<AiDetect>("ai_detect");
  },

  async complete(req: AiCompleteRequest): Promise<string> {
    return invoke<string>("ai_complete", {
      args: {
        prompt: req.prompt,
        system: req.system,
        model: req.model,
        schema: req.schema,
        claudePath: req.claudePath,
      },
    });
  },

  chat(req: AiChatRequest, onEvent: (e: AiEvent) => void): AiHandle {
    const channel = new Channel<AiEvent>();
    channel.onmessage = (e) => onEvent(e);
    // 비동기로 실행(완료를 기다리지 않음). 에러는 error 이벤트로 변환.
    invoke("ai_chat", {
      args: {
        reqId: req.reqId,
        prompt: req.prompt,
        system: req.system,
        model: req.model,
        sessionId: req.sessionId,
        claudePath: req.claudePath,
      },
      onEvent: channel,
    }).catch((err) => onEvent({ kind: "error", message: String(err) }));

    return {
      cancel: () => {
        invoke("ai_cancel", { reqId: req.reqId }).catch(() => {});
      },
    };
  },
};
```

`provider.ts`에 레지스트리 추가(파일 끝):

```ts
import { claudeProvider } from "./claude";

const PROVIDERS: Record<string, AiProvider> = {
  claude: claudeProvider,
};

export function getProvider(id: "claude" | "codex" = "claude"): AiProvider {
  return PROVIDERS[id] ?? claudeProvider;
}
```

> 주의: `provider.ts`가 `claude.ts`를 import하고 `claude.ts`가 `provider.ts`의
> 타입을 import한다(순환). 타입만 주고받으므로 런타임 순환은 없다 — `claude.ts`는
> `import type { ... } from "./provider"`로 타입만 가져온다(위 코드대로).

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd apps/desktop && npx vitest run src/core/ai/claude.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: 커밋**

```bash
cd apps/desktop && git add src/core/ai/provider.ts src/core/ai/claude.ts src/core/ai/claude.test.ts
git commit -m "기능: claude 어댑터 + provider 레지스트리(core/ai)"
```

---

## Task 9: 제안 카드 컴포넌트 (`components/AiSuggestionCard.tsx`)

요청 작성 도우미 결과를 보여주고 폼에 적용. 컴포넌트 테스트(@testing-library).

**Files:**
- Create: `apps/desktop/src/components/AiSuggestionCard.tsx`
- Test: `apps/desktop/src/components/AiSuggestionCard.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AiSuggestionCard } from "./AiSuggestionCard";
import type { RequestSuggestion } from "../core/ai/types";

const s: RequestSuggestion = { body: '{"name":"a"}', notes: "재고 포함", queryParams: { page: "2" } };

describe("AiSuggestionCard", () => {
  it("제안 본문과 메모를 표시한다", () => {
    render(<AiSuggestionCard suggestion={s} onApply={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText(/재고 포함/)).toBeTruthy();
    expect(screen.getByText(/"name"/)).toBeTruthy();
  });

  it("[폼에 적용] 클릭 시 onApply(suggestion) 호출", () => {
    const onApply = vi.fn();
    render(<AiSuggestionCard suggestion={s} onApply={onApply} onDismiss={() => {}} />);
    fireEvent.click(screen.getByText("폼에 적용"));
    expect(onApply).toHaveBeenCalledWith(s);
  });

  it("[무시] 클릭 시 onDismiss 호출", () => {
    const onDismiss = vi.fn();
    render(<AiSuggestionCard suggestion={s} onApply={() => {}} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("무시"));
    expect(onDismiss).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/desktop && npx vitest run src/components/AiSuggestionCard.test.tsx`
Expected: FAIL — 컴포넌트 없음.

- [ ] **Step 3: 컴포넌트 구현**

```tsx
import type { RequestSuggestion } from "../core/ai/types";

interface Props {
  suggestion: RequestSuggestion;
  onApply: (s: RequestSuggestion) => void;
  onDismiss: () => void;
}

/** 요청 작성 도우미 제안을 보여주고 폼에 적용/무시한다. */
export function AiSuggestionCard({ suggestion, onApply, onDismiss }: Props) {
  const { pathParams, queryParams, headers, body, notes } = suggestion;
  const kv = (rec?: Record<string, string>) =>
    rec && Object.keys(rec).length > 0
      ? Object.entries(rec).map(([k, v]) => `${k}: ${v}`).join("\n")
      : null;

  return (
    <div className="ai-suggestion">
      <div className="ai-suggestion-title">제안된 요청</div>
      {notes && <div className="ai-suggestion-notes">{notes}</div>}
      {kv(pathParams) && (
        <div className="ai-suggestion-section">
          <span className="ai-suggestion-label">Path</span>
          <pre>{kv(pathParams)}</pre>
        </div>
      )}
      {kv(queryParams) && (
        <div className="ai-suggestion-section">
          <span className="ai-suggestion-label">Query</span>
          <pre>{kv(queryParams)}</pre>
        </div>
      )}
      {kv(headers) && (
        <div className="ai-suggestion-section">
          <span className="ai-suggestion-label">Headers</span>
          <pre>{kv(headers)}</pre>
        </div>
      )}
      {body && (
        <div className="ai-suggestion-section">
          <span className="ai-suggestion-label">Body</span>
          <pre>{body}</pre>
        </div>
      )}
      <div className="ai-suggestion-actions">
        <button className="btn small primary" onClick={() => onApply(suggestion)}>
          폼에 적용
        </button>
        <button className="btn small" onClick={onDismiss}>
          무시
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/desktop && npx vitest run src/components/AiSuggestionCard.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
cd apps/desktop && git add src/components/AiSuggestionCard.tsx src/components/AiSuggestionCard.test.tsx
git commit -m "기능: AI 요청 제안 카드(diff 표시 + 폼 적용/무시)"
```

---

## Task 10: 채팅 패널 컴포넌트 (`components/AiPanel.tsx`)

메시지 리스트 + 입력창 + 모델 선택 + Q&A/요청생성 라우팅. provider를 prop으로
주입(테스트 가능).

**Files:**
- Create: `apps/desktop/src/components/AiPanel.tsx`
- Test: `apps/desktop/src/components/AiPanel.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AiPanel } from "./AiPanel";
import type { AiProvider, AiHandle } from "../core/ai/provider";

function makeProvider(over: Partial<AiProvider> = {}): AiProvider {
  return {
    id: "claude",
    displayName: "Claude",
    detect: vi.fn().mockResolvedValue({ claude: { path: "/c", version: "v" } }),
    chat: vi.fn((_req, onEvent): AiHandle => {
      onEvent({ kind: "delta", text: "답변" });
      onEvent({ kind: "done", sessionId: "s1" });
      return { cancel: vi.fn() };
    }),
    complete: vi.fn().mockResolvedValue(JSON.stringify({ body: '{"ok":1}' })),
    ...over,
  };
}

const ctx = () => "## 현재 엔드포인트\nGET /x";

describe("AiPanel", () => {
  it("질문 전송 시 chat을 호출하고 응답 델타를 렌더한다", async () => {
    const provider = makeProvider();
    render(<AiPanel provider={provider} buildContext={ctx} onApplySuggestion={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/질문/), { target: { value: "이거 뭐야?" } });
    fireEvent.click(screen.getByText("전송"));
    await waitFor(() => expect(screen.getByText(/답변/)).toBeTruthy());
    expect(provider.chat).toHaveBeenCalled();
  });

  it("'/요청' 접두는 complete로 라우팅하고 제안 카드를 띄운다", async () => {
    const provider = makeProvider();
    render(<AiPanel provider={provider} buildContext={ctx} onApplySuggestion={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/질문/), { target: { value: "/요청 상품 생성" } });
    fireEvent.click(screen.getByText("전송"));
    await waitFor(() => expect(screen.getByText("폼에 적용")).toBeTruthy());
    expect(provider.complete).toHaveBeenCalled();
  });

  it("제안 카드의 적용은 onApplySuggestion으로 전달된다", async () => {
    const provider = makeProvider();
    const onApply = vi.fn();
    render(<AiPanel provider={provider} buildContext={ctx} onApplySuggestion={onApply} />);
    fireEvent.change(screen.getByPlaceholderText(/질문/), { target: { value: "/요청 x" } });
    fireEvent.click(screen.getByText("전송"));
    await waitFor(() => screen.getByText("폼에 적용"));
    fireEvent.click(screen.getByText("폼에 적용"));
    expect(onApply).toHaveBeenCalledWith({ body: '{"ok":1}' });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/desktop && npx vitest run src/components/AiPanel.test.tsx`
Expected: FAIL — 컴포넌트 없음.

- [ ] **Step 3: 컴포넌트 구현**

```tsx
import { useRef, useState } from "react";
import type { AiProvider } from "../core/ai/provider";
import type { AiEvent, RequestSuggestion } from "../core/ai/types";
import { parseSuggestion, requestSuggestionSchema } from "../core/ai/schema";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, COMPLETE_MODEL } from "../core/ai/models";
import { AiSuggestionCard } from "./AiSuggestionCard";

interface Message {
  role: "user" | "assistant";
  text: string;
  suggestion?: RequestSuggestion;
}

interface Props {
  provider: AiProvider;
  buildContext: () => string;
  onApplySuggestion: (s: RequestSuggestion) => void;
}

const REQUEST_PREFIX = "/요청";
const CHAT_SYSTEM =
  "당신은 OpenAPI 클라이언트의 어시스턴트입니다. 사용자가 보고 있는 엔드포인트 컨텍스트를 바탕으로 한국어로 간결히 답하세요.";
const REQUEST_SYSTEM =
  "사용자 의도에 맞는 HTTP 요청 필드를 채우세요. 주어진 JSON 스키마에 맞는 객체만 출력합니다. 환경 변수는 {{이름}} 형태로 참조할 수 있습니다.";

let reqCounter = 1;

export function AiPanel({ provider, buildContext, onApplySuggestion }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState(DEFAULT_CHAT_MODEL);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string | undefined>(undefined);

  function reset() {
    setMessages([]);
    sessionRef.current = undefined;
    setError(null);
  }

  async function handleRequestBuild(question: string) {
    setBusy(true);
    setError(null);
    try {
      const prompt = `${buildContext()}\n\n## 요청\n${question}`;
      const raw = await provider.complete({
        prompt,
        system: REQUEST_SYSTEM,
        model: COMPLETE_MODEL,
        schema: JSON.stringify(requestSuggestionSchema),
      });
      const suggestion = parseSuggestion(raw);
      if (!suggestion) {
        setError("제안을 해석하지 못했습니다. 다시 시도해 주세요.");
      } else {
        setMessages((m) => [...m, { role: "assistant", text: suggestion.notes ?? "요청을 제안했습니다.", suggestion }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleChat(question: string) {
    setBusy(true);
    setError(null);
    const prompt = `${buildContext()}\n\n## 질문\n${question}`;
    let acc = "";
    setMessages((m) => [...m, { role: "assistant", text: "" }]);
    const onEvent = (e: AiEvent) => {
      if (e.kind === "delta") {
        acc += e.text;
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", text: acc };
          return copy;
        });
      } else if (e.kind === "done") {
        if (e.sessionId) sessionRef.current = e.sessionId;
        setBusy(false);
      } else if (e.kind === "error") {
        setError(e.message);
        setBusy(false);
      }
    };
    provider.chat(
      { reqId: reqCounter++, prompt, system: CHAT_SYSTEM, model, sessionId: sessionRef.current },
      onEvent,
    );
  }

  function send() {
    const q = input.trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    if (q.startsWith(REQUEST_PREFIX)) {
      handleRequestBuild(q.slice(REQUEST_PREFIX.length).trim());
    } else {
      handleChat(q);
    }
  }

  return (
    <div className="ai-panel">
      <div className="ai-panel-head">
        <span className="ai-panel-title">✦ AI</span>
        <select className="ai-model" value={model} onChange={(e) => setModel(e.target.value)}>
          {CHAT_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <button className="btn small" onClick={reset} title="새 대화">
          새 대화
        </button>
      </div>

      <div className="ai-messages">
        {messages.length === 0 && (
          <div className="ai-empty">
            질문하거나 <code>/요청 …</code> 으로 요청 폼을 자동 작성하세요.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-msg-${m.role}`}>
            <div className="ai-msg-text">{m.text}</div>
            {m.suggestion && (
              <AiSuggestionCard
                suggestion={m.suggestion}
                onApply={onApplySuggestion}
                onDismiss={() =>
                  setMessages((arr) => {
                    const copy = [...arr];
                    copy[i] = { ...copy[i], suggestion: undefined };
                    return copy;
                  })
                }
              />
            )}
          </div>
        ))}
        {error && <div className="ai-error">{error}</div>}
      </div>

      <div className="ai-input">
        <textarea
          value={input}
          placeholder="질문 또는 /요청 …  (Enter 전송, Shift+Enter 줄바꿈)"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
        />
        <button className="btn small primary" onClick={send} disabled={busy}>
          {busy ? "…" : "전송"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/desktop && npx vitest run src/components/AiPanel.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
cd apps/desktop && git add src/components/AiPanel.tsx src/components/AiPanel.test.tsx
git commit -m "기능: AI 채팅 패널(Q&A 스트리밍 + /요청 라우팅)"
```

---

## Task 11: App 통합 — 4번째 패널 + 토글 + 적용 배선 (`App.tsx`)

기존 상태 흐름을 재사용해 AI 패널을 붙인다. AI는 `setInputs`로 폼만 바꾸고 실행은
하지 않는다.

**Files:**
- Modify: `apps/desktop/src/App.tsx`

- [ ] **Step 1: import 추가**

`App.tsx` 상단 import 묶음(현재 49행 근처, `GlobalHeadersModal` import 아래)에 추가:

```tsx
import { AiPanel } from "./components/AiPanel";
import { getProvider } from "./core/ai/provider";
import { buildAiContext } from "./core/ai/context";
import { applySuggestion } from "./core/ai/schema";
```

- [ ] **Step 2: AI 패널 상태 추가**

`App()` 본문에서 커맨드 팔레트 상태(`const [paletteOpen, setPaletteOpen] = useState(false);`, 현재 213행 근처) 바로 아래에 추가:

```tsx
  // AI 어시스턴트 패널(우측) 토글 — 전역 저장
  const [aiOpen, setAiOpen] = useState<boolean>(() => loadJSON("swaggerman.aiOpen", false));
  useEffect(() => {
    saveJSON("swaggerman.aiOpen", aiOpen);
  }, [aiOpen]);
  const aiProvider = useMemo(() => getProvider("claude"), []);

  // AI에 줄 현재 컨텍스트 조립(엔드포인트/폼/응답/환경변수명)
  function currentAiContext(): string {
    if (!selected) return "현재 선택된 엔드포인트가 없습니다.";
    const env = envs.find((e) => e.baseURL === baseURL);
    const envVarNames = (env?.vars ?? []).map((v) => v.key).filter(Boolean);
    return buildAiContext({
      op: selected,
      inputs,
      response,
      envVarNames,
      baseURL,
    });
  }

  // AI 제안을 현재 폼에 적용(실행하지 않음 — 사용자가 ⌘Enter로 실행)
  function applyAiSuggestion(s: import("./core/ai/types").RequestSuggestion) {
    if (!inputs) return;
    setInputs(applySuggestion(inputs, s));
    log.info("ai", "요청 제안을 폼에 적용");
  }
```

- [ ] **Step 3: 툴바에 토글 버튼 추가**

`config-bar`의 테마 토글 버튼(현재 725행 근처, `theme === "dark" ? "☀︎" : "☾"` 버튼) **앞에** 추가:

```tsx
          <button
            className={aiOpen ? "btn small primary" : "btn small"}
            title="AI 어시스턴트 패널 열기/닫기"
            onClick={() => setAiOpen((v) => !v)}
          >
            ✦ AI
          </button>
```

- [ ] **Step 4a: 기존 3개 패널에 `order`/`id` 부여 (조건부 패널 대비)**

`autoSaveId`가 있는 `PanelGroup`에 패널을 조건부로 추가하려면 react-resizable-panels
v2는 각 `Panel`에 안정적인 `order`(와 `id`)가 필요하다. 없으면 패널 개수가 바뀔 때
저장된 레이아웃 복원이 어긋난다. 기존 세 `<Panel>` 여는 태그를 다음으로 바꾼다.

Sidebar 패널:
```tsx
        <Panel id="sidebar" order={1} defaultSize={24} minSize={14} className="pane">
```
RequestEditor 패널:
```tsx
        <Panel id="request" order={2} defaultSize={38} minSize={20} className="pane">
```
ResponseView 패널:
```tsx
        <Panel id="response" order={3} defaultSize={38} minSize={20} className="pane">
```

- [ ] **Step 4b: PanelGroup에 4번째 패널 추가**

`PanelGroup` 안에서 ResponseView를 담은 마지막 `</Panel>` **다음**(`</PanelGroup>` 앞)에 추가:

```tsx
        {aiOpen && (
          <>
            <PanelResizeHandle className="resize-handle" />
            <Panel id="ai" order={4} defaultSize={26} minSize={16} className="pane">
              <AiPanel
                provider={aiProvider}
                buildContext={currentAiContext}
                onApplySuggestion={applyAiSuggestion}
              />
            </Panel>
          </>
        )}
```

- [ ] **Step 5: 타입/린트/빌드 검증**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: 에러 없음.

Run: `cd apps/desktop && npm run lint`
Expected: 에러 없음(경고 0 권장).

- [ ] **Step 6: 전체 테스트**

Run: `cd apps/desktop && npm test`
Expected: 기존 + 신규 테스트 전부 PASS.

- [ ] **Step 7: 커밋**

```bash
cd apps/desktop && git add src/App.tsx
git commit -m "기능: App에 AI 패널 통합(토글 + 컨텍스트 + 제안 폼 적용)"
```

---

## Task 12: 스타일 (`App.css`)

AI 패널/메시지/제안 카드 스타일. 기존 디자인 토큰(`--bg`,`--bg-2`,`--border`,
`--text`,`--muted`,`--accent`) 재사용.

**Files:**
- Modify: `apps/desktop/src/App.css`

- [ ] **Step 1: 스타일 추가**

`App.css` 끝(라이트 테마 블록 `[data-theme="light"]` **위**, 일반 규칙 영역)에 추가:

```css
/* === AI 어시스턴트 패널 === */
.ai-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-2);
}
.ai-panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.ai-panel-title {
  font-weight: 600;
  color: var(--accent);
}
.ai-model {
  margin-left: auto;
  background: var(--bg-3);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 6px;
}
.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ai-empty {
  color: var(--muted);
  font-size: 13px;
  text-align: center;
  margin-top: 20px;
}
.ai-msg {
  max-width: 92%;
  padding: 8px 10px;
  border-radius: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
}
.ai-msg-user {
  align-self: flex-end;
  background: var(--accent);
  color: #fff;
}
.ai-msg-assistant {
  align-self: flex-start;
  background: var(--bg-3);
  color: var(--text);
}
.ai-error {
  color: #f85149;
  font-size: 12px;
  padding: 6px 8px;
  border: 1px solid #f85149;
  border-radius: 6px;
}
.ai-input {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid var(--border);
}
.ai-input textarea {
  flex: 1;
  resize: none;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
  font-family: inherit;
  font-size: 13px;
}
/* 제안 카드 */
.ai-suggestion {
  margin-top: 8px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  padding: 8px;
  background: var(--bg);
}
.ai-suggestion-title {
  font-weight: 600;
  margin-bottom: 4px;
}
.ai-suggestion-notes {
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 6px;
}
.ai-suggestion-section {
  margin: 6px 0;
}
.ai-suggestion-label {
  display: inline-block;
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  margin-bottom: 2px;
}
.ai-suggestion-section pre {
  margin: 0;
  padding: 6px;
  background: var(--bg-3);
  border-radius: 6px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
.ai-suggestion-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
```

- [ ] **Step 2: 시각 확인(수동)**

Run: `cd apps/desktop && npm run tauri dev`
Expected: 앱 실행 → `config-bar`의 `✦ AI` 클릭 → 우측 패널 표시. 다크/라이트 토글
시 색이 토큰을 따라 바뀐다. (스펙 로딩 후 엔드포인트 선택 상태에서 확인.)

- [ ] **Step 3: 커밋**

```bash
cd apps/desktop && git add src/App.css
git commit -m "기능: AI 패널/메시지/제안 카드 스타일(디자인 토큰 재사용)"
```

---

## Task 13: 실측 검증 & 마감 (수동 + 문서)

claude stream-json 실제 포맷을 확인하고, 어긋나면 `parse_stream_line`을 보정한다.
이 태스크는 가정(§10 미해결)을 실측으로 닫는다.

**Files:**
- (필요 시) Modify: `apps/desktop/src-tauri/src/ai.rs`
- Modify: `apps/desktop/CHANGELOG.md`

- [ ] **Step 1: claude stream-json 실측**

Run:
```bash
echo "한 문장으로 자기소개해줘" | claude -p --output-format stream-json --include-partial-messages --verbose --model haiku
```
Expected: 여러 줄 JSON. 각 줄의 `type` 값을 확인한다 — 텍스트 델타가
`type:"stream_event"`의 `event.type:"content_block_delta"`,`delta.type:"text_delta"`로
오는지, 마지막 줄이 `type:"result"`(+`session_id`)인지.

- [ ] **Step 2: 불일치 시 파서 보정**

만약 실제 필드 구조가 다르면 `parse_stream_line`과 Task 6의 해당 테스트를 실제
포맷에 맞춰 수정한다(테스트의 입력 JSON을 실측 라인으로 교체 → 빨강 → 구현 수정 →
초록). 일치하면 이 단계는 건너뛴다.

Run(보정했다면): `cd apps/desktop/src-tauri && cargo test ai::`
Expected: PASS.

- [ ] **Step 3: --json-schema 동작 확인**

Run:
```bash
echo "이름은 hi, 재고는 3인 상품 생성 요청을 만들어줘" | claude -p --output-format json --model haiku --json-schema '{"type":"object","additionalProperties":false,"properties":{"body":{"type":"string"},"notes":{"type":"string"}}}'
```
Expected: `result`가 스키마를 따르는 JSON. 만약 `--json-schema`가 거부되거나
무시되면, `parseSuggestion`이 이미 자유 텍스트 속 JSON 래퍼를 처리하므로 동작은
유지된다 — 다만 안정성을 위해 `REQUEST_SYSTEM`에 "스키마에 맞는 JSON만 출력"을
이미 명시해 두었다. 추가 보정 불필요면 통과.

- [ ] **Step 4: 엔드투엔드 수동 확인**

`npm run tauri dev`에서:
1. 스펙 로드 → POST 엔드포인트 선택 → `✦ AI` 열기
2. "이 엔드포인트 뭐해?" → 스트리밍 답변 표시
3. "/요청 (자연어로 본문 요청)" → 제안 카드 → [폼에 적용] → 가운데 요청 폼의
   body/params가 채워짐(실행은 안 됨) → 사용자가 ⌘Enter로 실행
4. "새 대화"로 세션 리셋 확인

- [ ] **Step 5: CHANGELOG 갱신 & 커밋**

`apps/desktop/CHANGELOG.md` 맨 위에 항목 추가(기존 형식을 따른다):

```markdown
## v0.3.0
- AI 어시스턴트 패널: 현재 엔드포인트 컨텍스트로 로컬 claude와 대화(Q&A 스트리밍)
- 요청 작성 도우미: 자연어(/요청)로 요청 폼 자동 제안 → 검토 후 [폼에 적용]
```

```bash
cd apps/desktop && git add -A
git commit -m "문서: v0.3.0 CHANGELOG(AI 어시스턴트 패널)"
```

- [ ] **Step 6: 최종 검증**

Run: `cd apps/desktop && npm test && npm run lint && npx tsc --noEmit`
Expected: 전부 통과.

Run: `cd apps/desktop/src-tauri && cargo test`
Expected: 전부 통과.

---

## 완료 기준 (M1)

- [ ] `✦ AI` 토글로 우측 패널 열고 닫기 가능, 상태 영속.
- [ ] 일반 질문 → claude 스트리밍 답변이 실시간 표시.
- [ ] `/요청 …` → 구조화 제안 카드 → [폼에 적용] 시 가운데 폼 갱신(실행 안 함).
- [ ] 세션 연속(후속 질문이 맥락 유지), "새 대화"로 리셋.
- [ ] claude 미발견/실패 시 패널에 명확한 에러.
- [ ] 환경변수 **값**은 컨텍스트에 절대 포함되지 않음(`context.test.ts`로 보장).
- [ ] 프론트/러스트 테스트·린트·타입 전부 통과.

## 후속 (M1 이후 별도 계획)

- **M2 자동완성**: `ai_complete`/`schema.ts` 재사용. ① `JsonEditor`에 ghost text
  오버레이 + `⌘.` 트리거(Tab 수락) ② 파라미터/body 필드별 `✦` 값 제안.
- **설정 UI**: `SettingsModal`에 AI 섹션(claude 경로 수동 지정, 기본 모델). M1은
  자동 탐지로 동작하며, 경로 지정이 필요한 환경에서 추가.
- **codex 어댑터**: `provider.ts` 레지스트리에 codex 구현 추가.
