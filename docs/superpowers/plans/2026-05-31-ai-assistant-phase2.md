# SwaggerMan AI 어시스턴트 2차 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 어시스턴트에 응답 기반 진단/설명, 프로젝트별 챗 히스토리 영속화, 제안 다양화(cURL/변수), 응답 품질 개선(잉여키 검증/프롬프트/컨텍스트 보강), 테스트 보강을 추가한다.

**Architecture:** 신규 순수 로직은 `core/ai/`(prompts·history·schema확장·context확장)에 모아 단위 테스트한다. UI는 기존 AiPanel/AiSuggestionCard/ResponseView/CommandPalette/App에 얇게 얹는다. AI는 여전히 제안만 만들고 HTTP 실행은 사람이 한다.

**Tech Stack:** Tauri 2(Rust) · React 19 + TS · Vite · Vitest · @testing-library/react(jsdom) · 로컬 claude CLI.

**관련 spec:** `docs/superpowers/specs/2026-05-31-ai-assistant-phase2-design.md`
**브랜치:** `feat/ai-assistant`

---

## 사전 사실 (executor가 알아야 할 것)

- 작업 루트: `apps/desktop`. 프론트 테스트 `npx vitest run <파일>` / 전체 `npm test`. 컴포넌트/localStorage 테스트 파일 첫 줄 `// @vitest-environment jsdom` 필수. 순수 테스트는 명시적 `import { describe, it, expect } from "vitest";`.
- Rust 테스트 `cd src-tauri && cargo test ai::`(타임아웃 넉넉히 600000ms).
- `core/ai/context.ts`의 `buildAiContext({op, inputs, response, envVarNames, baseURL})`는 이미 파라미터 타입만 출력(enum/example 미포함). `schemaOutline(schema, depth)`은 재귀(깊이 4)·required(*) 처리. `op.responses`는 `ParsedResponse[]`(각 `{statusCode, description?, schema?, example?}`).
- `core/ai/schema.ts`: `parseSuggestion`(structured_output/result 래퍼/코드펜스 처리), `applySuggestion`, `requestSuggestionSchema`, 내부 `pickKnown`/`upsert`.
- `core/ai/types.ts`: `RequestSuggestion = { pathParams?; queryParams?; headers?; body?; notes? }`(dict는 Record<string,string>).
- `core/request-builder.ts`: `RequestInputs`, `RequestParam = {key;value;enabled}`, `buildRequest(baseURL, op, inputs, securityHeaders?, globalHeaders?, vars?) → HTTPRequest`.
- `core/curl-builder.ts`: `buildCurl(request: HTTPRequest): string`.
- `core/storage.ts`: `loadJSON<T>(key, fallback)`, `saveJSON(key, value)` — 키에 `"swaggerman."` 접두를 **호출자가 직접** 붙임(자동 아님).
- `components/AiPanel.tsx` props: `{ provider, buildContext, onApplySuggestion, paramNames?, onMentions? }`. 내부 `Message = { role; text; suggestion?; usage? }`, state `messages/totals/sessionRef/busy/building/...`, 함수 `reset/handleRequestBuild/handleChat/fillFormFor/send`. `REQUEST_SYSTEM`/`CHAT_SYSTEM` 상수.
- `components/AiSuggestionCard.tsx` props: `{ suggestion, onApply, onDismiss }`.
- App.tsx: `activeSpecUrl`, `selected`(ParsedOperation|null), `inputs`, `response`(HTTPResponse|null, `.statusCode`), `baseURL`, `envs`/`setEnvs`(Env[] = {name,baseURL,vars?:{key,value}[]}), `globalHeaders`, `authValues`, `spec`, `aiOpen`/`setAiOpen`, `opParamNames`(useMemo), `activeVars`(useMemo), `computeSecurityHeaders(spec?.securitySchemes ?? [], authValues)`. `<AiPanel paramNames=.. onMentions=.. .../>`, `<ResponseView .../>`, `<CommandPalette .../>`.
- 커밋 메시지 한국어 관례: `기능:`/`개선:`/`버그수정:`/`문서:`/`테스트:`.

## 파일 구조

**신규**
- `src/core/ai/prompts.ts` (+ `prompts.test.ts`) — 진단/설명 프롬프트 빌더(순수)
- `src/core/ai/history.ts` (+ `history.test.ts`) — 챗 저장/복원(순수)
- `scripts/ai-e2e.ts` — 실제 claude E2E 스모크(옵트인, 스위트 제외)

**수정**
- `src/core/ai/schema.ts` (+ test) — `filterKnownParams` 추가
- `src/core/ai/context.ts` (+ test) — enum/example/응답스키마 보강
- `src/components/AiPanel.tsx` (+ test) — history 연동 · filterKnownParams 적용 · REQUEST_SYSTEM 보강 · pendingPrompt 자동전송 · cURL/변수 패스스루
- `src/components/AiSuggestionCard.tsx` (+ test) — cURL/변수 액션
- `src/components/ResponseView.tsx` — ✦설명/✦진단 버튼
- `src/components/CommandPalette.tsx` — AI 응답 항목
- `src/App.tsx` — aiPendingPrompt 상태 · 핸들러 · AiPanel에 specUrl/pendingPrompt/cURL/변수 전달
- `src-tauri/src/ai.rs` — 스트림 시퀀스 통합 테스트
- `package.json` — `ai:e2e` 스크립트
- `src/App.css` — 버튼 스타일

---

## Task 1: 컨텍스트 보강 — enum/example + 응답 스키마 (`core/ai/context.ts`)

**Files:**
- Modify: `apps/desktop/src/core/ai/context.ts`
- Test: `apps/desktop/src/core/ai/context.test.ts`

- [ ] **Step 1: 실패 테스트 추가** — `context.test.ts`의 `describe("buildAiContext", ...)` 안에 추가:

```ts
  it("파라미터의 enum/example을 컨텍스트에 포함한다", () => {
    const opE: ParsedOperation = {
      ...op,
      parameters: [
        { id: "q1", name: "status", location: "query", required: false,
          schema: { type: "string", enumValues: ["active", "closed"], example: "active" } },
      ],
    };
    const ctx = buildAiContext({ op: opE, inputs: null, response: null, envVarNames: [], baseURL: "" });
    expect(ctx).toContain("status");
    expect(ctx).toContain("active");
    expect(ctx).toContain("closed");
  });

  it("성공 응답(2xx) 스키마 개요를 포함한다", () => {
    const opR: ParsedOperation = {
      ...op,
      responses: [
        { statusCode: "200", description: "ok",
          schema: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } } } },
      ],
    };
    const ctx = buildAiContext({ op: opR, inputs: null, response: null, envVarNames: [], baseURL: "" });
    expect(ctx).toContain("응답");
    expect(ctx).toContain("id");
    expect(ctx).toContain("name");
  });
```

(파일 상단 공유 `op` 픽스처를 spread로 재사용.)

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/core/ai/context.test.ts`
Expected: FAIL (enum/응답 스키마 미출력).

- [ ] **Step 3: 구현** — `context.ts` 파라미터 출력 루프(현재 46-52행)를 교체:

```ts
  if (op.parameters.length > 0) {
    parts.push("\n## 파라미터");
    for (const p of op.parameters) {
      const mark = p.required ? "*" : "";
      const extras: string[] = [];
      if (p.schema?.enumValues?.length) extras.push(`enum: ${p.schema.enumValues.join("|")}`);
      if (p.schema?.example != null && p.schema.example !== "") extras.push(`예: ${p.schema.example}`);
      else if (p.schema?.defaultValue != null && p.schema.defaultValue !== "") extras.push(`기본: ${p.schema.defaultValue}`);
      const suffix = extras.length ? ` (${extras.join(", ")})` : "";
      parts.push(`- (${p.location}) ${p.name}${mark}: ${p.schema?.type ?? "string"}${suffix}`);
    }
  }
```

요청 본문 블록(현재 54-58행) 바로 아래에 성공 응답 스키마 개요 추가:

```ts
  const okResp = op.responses.find((r) => /^2\d\d$/.test(r.statusCode));
  if (okResp?.schema) {
    parts.push(`\n## 성공 응답(${okResp.statusCode}) 스키마`);
    const outline = schemaOutline(okResp.schema);
    if (outline) parts.push(outline);
  }
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/core/ai/context.test.ts`
Expected: PASS (전체).

- [ ] **Step 5: 커밋**

```bash
cd apps/desktop && git add src/core/ai/context.ts src/core/ai/context.test.ts
git commit -m "개선: AI 컨텍스트에 파라미터 enum/example + 성공 응답 스키마 보강"
```

---

## Task 2: 잉여키 검증 `filterKnownParams` (`core/ai/schema.ts`)

**Files:**
- Modify: `apps/desktop/src/core/ai/schema.ts`
- Test: `apps/desktop/src/core/ai/schema.test.ts`

- [ ] **Step 1: 실패 테스트 추가** — `schema.test.ts` 끝에 추가:

```ts
import { filterKnownParams } from "./schema";

describe("filterKnownParams", () => {
  it("op에 없는 query/path 키를 제거한다", () => {
    const s = { queryParams: { keyword: "dell", endpoint: "x" }, pathParams: { id: "1", bogus: "y" } };
    const out = filterKnownParams(s, ["keyword", "id"]);
    expect(out.queryParams).toEqual({ keyword: "dell" });
    expect(out.pathParams).toEqual({ id: "1" });
  });

  it("headers는 그대로 통과시킨다(커스텀 헤더 허용)", () => {
    const s = { headers: { "X-Trace": "abc" } };
    expect(filterKnownParams(s, [])).toEqual({ headers: { "X-Trace": "abc" } });
  });

  it("body/notes는 보존한다", () => {
    const s = { body: "{}", notes: "n", queryParams: { bad: "1" } };
    const out = filterKnownParams(s, []);
    expect(out.body).toBe("{}");
    expect(out.notes).toBe("n");
    expect(out.queryParams).toEqual({});
  });

  it("원본을 변형하지 않는다", () => {
    const s = { queryParams: { bad: "1" } };
    filterKnownParams(s, []);
    expect(s.queryParams).toEqual({ bad: "1" });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/core/ai/schema.test.ts`
Expected: FAIL — `filterKnownParams` 없음.

- [ ] **Step 3: 구현** — `schema.ts` 파일 끝(`applySuggestion` 아래)에 추가:

```ts
/** 제안의 query/path 키를 op 실제 파라미터명으로 필터링한다(폼 오염 방지). header는 통과. 불변. */
export function filterKnownParams(s: RequestSuggestion, opParamNames: string[]): RequestSuggestion {
  const allowed = new Set(opParamNames);
  const keep = (rec?: Record<string, string>) => {
    if (!rec) return rec;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(rec)) if (allowed.has(k)) out[k] = v;
    return out;
  };
  return {
    ...s,
    pathParams: keep(s.pathParams),
    queryParams: keep(s.queryParams),
    // headers는 표준/커스텀 헤더가 많아 op 파라미터명에 없어도 통과시킨다.
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/core/ai/schema.test.ts`
Expected: PASS (전체).

- [ ] **Step 5: 커밋**

```bash
cd apps/desktop && git add src/core/ai/schema.ts src/core/ai/schema.test.ts
git commit -m "기능: 제안 잉여키 검증 filterKnownParams(폼 오염 방지)"
```

---

## Task 3: Rust 스트림 시퀀스 통합 테스트 (`ai.rs`)

**Files:**
- Modify: `apps/desktop/src-tauri/src/ai.rs`

- [ ] **Step 1: 테스트 추가** — `ai.rs`의 `mod tests` 안에 추가:

```rust
    #[test]
    fn parse_stream_sequence_yields_deltas_then_done_with_usage() {
        let lines = [
            r#"{"type":"system","subtype":"init"}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"안"}}}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"무시"}}}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"녕"}}}"#,
            r#"{"type":"result","is_error":false,"session_id":"s","usage":{"input_tokens":5,"output_tokens":7}}"#,
        ];
        let events: Vec<AiEvent> = lines.iter().filter_map(|l| parse_stream_line(l)).collect();
        let deltas: Vec<&str> = events.iter().filter_map(|e| match e {
            AiEvent::Delta { text } => Some(text.as_str()),
            _ => None,
        }).collect();
        assert_eq!(deltas, vec!["안", "녕"]);
        match events.last() {
            Some(AiEvent::Done { input_tokens, output_tokens, .. }) => {
                assert_eq!(*input_tokens, Some(5));
                assert_eq!(*output_tokens, Some(7));
            }
            _ => panic!("expected Done last"),
        }
    }
```

- [ ] **Step 2: 통과 확인**

Run: `cd apps/desktop/src-tauri && cargo test ai::` (타임아웃 600000ms)
Expected: 신규 포함 전부 PASS.

- [ ] **Step 3: 커밋**

```bash
cd apps/desktop && git add src-tauri/src/ai.rs
git commit -m "테스트: Rust stream-json 시퀀스 파싱(델타 누적+done usage)"
```

---

## Task 4: 챗 히스토리 영속화 모듈 (`core/ai/history.ts`)

**Files:**
- Create: `apps/desktop/src/core/ai/history.ts`
- Test: `apps/desktop/src/core/ai/history.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `history.test.ts`(첫 줄 jsdom 도크블록 필수):

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { loadChat, saveChat, clearChat, type StoredChat } from "./history";

beforeEach(() => localStorage.clear());

const chat: StoredChat = {
  messages: [
    { role: "user", text: "안녕" },
    { role: "assistant", text: "네", usage: { input: 1, output: 2 } },
  ],
  sessionId: "s1",
  totals: { input: 1, output: 2 },
};

describe("history", () => {
  it("저장 후 같은 specUrl로 복원한다", () => {
    saveChat("http://x/api", chat);
    expect(loadChat("http://x/api")).toEqual(chat);
  });
  it("다른 specUrl은 분리된다", () => {
    saveChat("http://x/api", chat);
    expect(loadChat("http://y/api")).toBeNull();
  });
  it("저장본 없으면 null", () => {
    expect(loadChat("http://none")).toBeNull();
  });
  it("clearChat은 저장본을 비운다", () => {
    saveChat("http://x/api", chat);
    clearChat("http://x/api");
    expect(loadChat("http://x/api")).toBeNull();
  });
  it("깨진 저장본은 null로 방어한다", () => {
    localStorage.setItem("swaggerman.aichat.http://x/api", "{ not json");
    expect(loadChat("http://x/api")).toBeNull();
  });
  it("형태가 안 맞으면 null(messages 배열 아님)", () => {
    localStorage.setItem("swaggerman.aichat.http://x/api", JSON.stringify({ messages: "x" }));
    expect(loadChat("http://x/api")).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/core/ai/history.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** — `history.ts`:

```ts
import { loadJSON, saveJSON } from "../storage";
import type { RequestSuggestion } from "./types";

export interface StoredMessage {
  role: "user" | "assistant";
  text: string;
  suggestion?: RequestSuggestion;
  usage?: { input: number; output: number };
}

export interface StoredChat {
  messages: StoredMessage[];
  sessionId?: string;
  totals: { input: number; output: number };
}

const keyFor = (specUrl: string) => `swaggerman.aichat.${specUrl}`;

/** 깨지거나 형태가 안 맞으면 null. */
export function loadChat(specUrl: string): StoredChat | null {
  if (!specUrl) return null;
  const raw = loadJSON<StoredChat | null>(keyFor(specUrl), null);
  if (!raw || typeof raw !== "object") return null;
  if (!Array.isArray(raw.messages)) return null;
  const totals =
    raw.totals && typeof raw.totals === "object"
      ? { input: Number(raw.totals.input) || 0, output: Number(raw.totals.output) || 0 }
      : { input: 0, output: 0 };
  return { messages: raw.messages, sessionId: raw.sessionId, totals };
}

export function saveChat(specUrl: string, chat: StoredChat): void {
  if (!specUrl) return;
  saveJSON(keyFor(specUrl), chat);
}

export function clearChat(specUrl: string): void {
  if (!specUrl) return;
  localStorage.removeItem(keyFor(specUrl));
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/core/ai/history.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: 커밋**

```bash
cd apps/desktop && git add src/core/ai/history.ts src/core/ai/history.test.ts
git commit -m "기능: 챗 히스토리 영속화 모듈(프로젝트별 저장/복원/방어)"
```

---

## Task 5: 응답 기반 프롬프트 빌더 (`core/ai/prompts.ts`)

**Files:**
- Create: `apps/desktop/src/core/ai/prompts.ts`
- Test: `apps/desktop/src/core/ai/prompts.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `prompts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { diagnosePrompt, explainPrompt } from "./prompts";

describe("prompts", () => {
  it("진단 프롬프트는 원인/진단 의도를 담는다", () => {
    const p = diagnosePrompt();
    expect(p).toMatch(/진단|원인|실패/);
    expect(p.length).toBeGreaterThan(0);
  });
  it("설명 프롬프트는 요약/설명 의도를 담는다", () => {
    expect(explainPrompt()).toMatch(/요약|설명/);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/core/ai/prompts.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** — `prompts.ts`:

```ts
/** 응답 기반 AI 액션용 사용자 프롬프트(순수). 실제 응답/스펙 컨텍스트는
 *  AiPanel이 buildAiContext로 함께 전달하므로 여기서는 지시문만 만든다. */

export function diagnosePrompt(): string {
  return "직전 응답의 상태코드와 본문을 근거로, 이 요청이 왜 이런 결과(특히 실패라면 그 원인)를 냈는지 진단하고, 어떻게 고치면 되는지 한국어로 구체적으로 설명해 주세요.";
}

export function explainPrompt(): string {
  return "직전 응답 본문을 한국어로 간결히 요약하고, 주요 필드의 의미를 설명해 주세요.";
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/core/ai/prompts.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
cd apps/desktop && git add src/core/ai/prompts.ts src/core/ai/prompts.test.ts
git commit -m "기능: 응답 기반 AI 프롬프트 빌더(진단/설명)"
```

---

## Task 6: AiPanel — history 연동 + 잉여키 필터 + 프롬프트 보강 (`AiPanel.tsx`)

**Files:**
- Modify: `apps/desktop/src/components/AiPanel.tsx`
- Test: `apps/desktop/src/components/AiPanel.test.tsx`
- Modify: `apps/desktop/src/App.tsx` (specUrl 전달)

- [ ] **Step 1: 실패 테스트 추가** — `AiPanel.test.tsx`에 추가:

```ts
it("specUrl 저장본을 마운트 시 복원한다", () => {
  localStorage.clear();
  localStorage.setItem(
    "swaggerman.aichat.http://x",
    JSON.stringify({ messages: [{ role: "assistant", text: "복원됨" }], totals: { input: 0, output: 0 } }),
  );
  const provider = makeProvider();
  render(<AiPanel provider={provider} buildContext={ctx} onApplySuggestion={() => {}} specUrl="http://x" />);
  expect(screen.getByText("복원됨")).toBeTruthy();
});

it("새 대화는 저장본도 비운다", () => {
  localStorage.clear();
  localStorage.setItem(
    "swaggerman.aichat.http://x",
    JSON.stringify({ messages: [{ role: "assistant", text: "옛날" }], totals: { input: 0, output: 0 } }),
  );
  const provider = makeProvider();
  render(<AiPanel provider={provider} buildContext={ctx} onApplySuggestion={() => {}} specUrl="http://x" />);
  fireEvent.click(screen.getByText("새 대화"));
  expect(localStorage.getItem("swaggerman.aichat.http://x")).toBeNull();
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/components/AiPanel.test.tsx`
Expected: FAIL — specUrl 미구현.

- [ ] **Step 3: 구현**

(a) import: 기존 `import { parseSuggestion, requestSuggestionSchema } from "../core/ai/schema";`를 `import { parseSuggestion, requestSuggestionSchema, filterKnownParams } from "../core/ai/schema";`로 교체. 추가: `import { loadChat, saveChat, clearChat } from "../core/ai/history";`

(b) Props 인터페이스에 `specUrl?: string;` 추가, 구조분해에 `specUrl` 추가.

(c) 복원/저장 effect 추가(다른 useEffect 근처):

```ts
  // specUrl별 저장본 복원(specUrl 변경 시 교체).
  useEffect(() => {
    if (!specUrl) return;
    const stored = loadChat(specUrl);
    setMessages(stored?.messages ?? []);
    setTotals(stored?.totals ?? { input: 0, output: 0 });
    sessionRef.current = stored?.sessionId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specUrl]);

  // 메시지/누적 변경 시 저장.
  useEffect(() => {
    if (!specUrl) return;
    saveChat(specUrl, { messages, sessionId: sessionRef.current, totals });
  }, [messages, totals, specUrl]);
```

(d) `reset()` 본문 끝에 추가: `if (specUrl) clearChat(specUrl);`

(e) 잉여키 필터 — `handleRequestBuild`에서 `const suggestion = parseSuggestion(raw);` 다음에 필터 적용 후 이후 `suggestion`을 `filtered`로 사용:

```ts
      const parsed = parseSuggestion(raw);
      const filtered = parsed ? filterKnownParams(parsed, paramNames) : null;
      if (genRef.current !== myGen) return;
      if (!filtered) {
        setError("제안을 해석하지 못했습니다. 다시 시도해 주세요.");
      } else {
        setMessages((m) => [...m, { role: "assistant", text: filtered.notes ?? "요청을 제안했습니다.", suggestion: filtered }]);
      }
```

`fillFormFor`도 동일하게: parse 후 `const filtered = parsed ? filterKnownParams(parsed, paramNames) : null;` → `copy[index] = { ...copy[index], suggestion: filtered }`(없으면 setError).

(f) `REQUEST_SYSTEM` 상수에 문장 추가(끝에):

```ts
const REQUEST_SYSTEM =
  "사용자 의도에 맞는 HTTP 요청 필드를 채우세요. 주어진 JSON 스키마에 맞는 객체만 출력합니다. 어떤 도구도 사용하지 말고 실제 요청을 실행하지 마세요. body에는 마크다운 코드펜스 없이 순수 문자열만 넣고, 스키마에 정의된 키만 사용하세요. 제공된 파라미터 목록에 없는 키는 만들지 말고, 모르면 비워 두세요. 환경 변수는 {{이름}} 형태로 참조할 수 있습니다.";
```

- [ ] **Step 4: App.tsx에서 specUrl 전달** — `<AiPanel ... />`에 `specUrl={activeSpecUrl}` 추가.

- [ ] **Step 5: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/components/AiPanel.test.tsx && npx tsc --noEmit`
Expected: PASS, tsc 클린. (기존 테스트는 specUrl 없이 렌더 → effect no-op.)

- [ ] **Step 6: 커밋**

```bash
cd apps/desktop && git add src/components/AiPanel.tsx src/components/AiPanel.test.tsx src/App.tsx
git commit -m "기능: AI 챗 히스토리 연동 + 잉여키 필터 적용 + 프롬프트 보강"
```

---

## Task 7: AiPanel pendingPrompt 자동 전송 (`AiPanel.tsx`)

**Files:**
- Modify: `apps/desktop/src/components/AiPanel.tsx`
- Test: `apps/desktop/src/components/AiPanel.test.tsx`

- [ ] **Step 1: 실패 테스트 추가**:

```ts
it("pendingPrompt가 들어오면 자동으로 chat 전송하고 consume한다", async () => {
  const provider = makeProvider();
  const onConsumed = vi.fn();
  const { rerender } = render(
    <AiPanel provider={provider} buildContext={ctx} onApplySuggestion={() => {}} onPendingConsumed={onConsumed} />,
  );
  rerender(
    <AiPanel provider={provider} buildContext={ctx} onApplySuggestion={() => {}} pendingPrompt="이 응답 진단해줘" onPendingConsumed={onConsumed} />,
  );
  await waitFor(() => expect(provider.chat).toHaveBeenCalled());
  expect(onConsumed).toHaveBeenCalled();
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/components/AiPanel.test.tsx`
Expected: FAIL — pendingPrompt 미구현.

- [ ] **Step 3: 구현**

(a) Props에 `pendingPrompt?: string;`, `onPendingConsumed?: () => void;` 추가 + 구조분해.

(b) 자동 전송 effect(다른 effect 근처):

```ts
  // App이 보류 프롬프트를 내려주면 자동으로 한 번 전송하고 consume.
  useEffect(() => {
    if (!pendingPrompt || busy) return;
    setMessages((m) => [...m, { role: "user", text: pendingPrompt }]);
    handleChat(pendingPrompt);
    onPendingConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/components/AiPanel.test.tsx && npx tsc --noEmit`
Expected: PASS, tsc 클린.

- [ ] **Step 5: 커밋**

```bash
cd apps/desktop && git add src/components/AiPanel.tsx src/components/AiPanel.test.tsx
git commit -m "기능: AiPanel pendingPrompt 자동 전송(consume 패턴)"
```

---

## Task 8: 응답 AI 트리거 배선 — App + ResponseView + 팔레트

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/components/ResponseView.tsx`
- Modify: `apps/desktop/src/components/CommandPalette.tsx`

- [ ] **Step 1: App 상태/핸들러**

import 추가: `import { diagnosePrompt, explainPrompt } from "./core/ai/prompts";`
aiOpen 근처에 추가:

```ts
  const [aiPendingPrompt, setAiPendingPrompt] = useState<string | null>(null);
  function askAiAboutResponse(kind: "diagnose" | "explain") {
    setAiOpen(true);
    setAiPendingPrompt(kind === "diagnose" ? diagnosePrompt() : explainPrompt());
  }
```

`<AiPanel ... />`에 추가: `pendingPrompt={aiPendingPrompt ?? undefined}` `onPendingConsumed={() => setAiPendingPrompt(null)}`.

- [ ] **Step 2: ResponseView 버튼**

`ResponseView`의 Props에 `onAskAi?: (kind: "diagnose" | "explain") => void;` 추가(구조분해 포함). 응답 헤더/탭 영역에서 `response`가 있을 때 렌더(기존 `response` prop명 확인; ResponseView는 이미 response를 받음):

```tsx
{response && onAskAi && (
  <span className="ai-resp-actions">
    <button className="btn small" onClick={() => onAskAi("explain")} title="이 응답을 AI로 설명">✦ 설명</button>
    {response.statusCode >= 400 && (
      <button className="btn small" onClick={() => onAskAi("diagnose")} title="실패 원인을 AI로 진단">✦ 진단</button>
    )}
  </span>
)}
```

App의 `<ResponseView ... />`에 `onAskAi={askAiAboutResponse}` 추가.

- [ ] **Step 3: CommandPalette 항목**

`CommandPalette` Props에 `onAskAiResponse?: (kind: "diagnose" | "explain") => void;`, `hasResponse?: boolean;`, `responseIsError?: boolean;` 추가. 기존 명령 목록 구성 방식(배열/필터)에 맞춰 항목 추가 — 기존 항목 형태가 `{ id/label/action }`이면 그에 맞춰:

```tsx
...(hasResponse && onAskAiResponse
  ? [
      { id: "ai-explain", label: "AI: 응답 설명", action: () => onAskAiResponse("explain") },
      ...(responseIsError ? [{ id: "ai-diagnose", label: "AI: 응답 진단", action: () => onAskAiResponse("diagnose") }] : []),
    ]
  : []),
```

(CommandPalette의 실제 항목 인터페이스에 맞게 `action`/`run`/`onSelect` 키명을 맞춘다 — 파일을 열어 기존 항목과 동일한 형태로.)

App의 `<CommandPalette ... />`에 추가:
```tsx
onAskAiResponse={askAiAboutResponse}
hasResponse={!!response}
responseIsError={!!response && response.statusCode >= 400}
```

- [ ] **Step 4: 검증**

Run: `cd apps/desktop && npx tsc --noEmit && npm run lint && npm test`
Expected: 전부 통과.

- [ ] **Step 5: 커밋**

```bash
cd apps/desktop && git add src/App.tsx src/components/ResponseView.tsx src/components/CommandPalette.tsx
git commit -m "기능: 응답 기반 AI 진단/설명 트리거(응답 패널 + 커맨드 팔레트)"
```

---

## Task 9: 제안 다양화 — cURL 복사 / 변수 저장

**Files:**
- Modify: `apps/desktop/src/components/AiSuggestionCard.tsx`
- Test: `apps/desktop/src/components/AiSuggestionCard.test.tsx`
- Modify: `apps/desktop/src/components/AiPanel.tsx` (패스스루)
- Modify: `apps/desktop/src/App.tsx` (핸들러)

- [ ] **Step 1: 실패 테스트 추가** — `AiSuggestionCard.test.tsx`:

```ts
it("[cURL 복사]/[변수로 저장] 클릭 시 콜백 호출", () => {
  const onCopyCurl = vi.fn();
  const onSaveVars = vi.fn();
  render(<AiSuggestionCard suggestion={s} onApply={() => {}} onDismiss={() => {}} onCopyCurl={onCopyCurl} onSaveVars={onSaveVars} />);
  fireEvent.click(screen.getByText("cURL 복사"));
  expect(onCopyCurl).toHaveBeenCalledWith(s);
  fireEvent.click(screen.getByText("변수로 저장"));
  expect(onSaveVars).toHaveBeenCalledWith(s);
});

it("콜백 미제공 시 버튼을 렌더하지 않는다", () => {
  render(<AiSuggestionCard suggestion={s} onApply={() => {}} onDismiss={() => {}} />);
  expect(screen.queryByText("cURL 복사")).toBeNull();
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/components/AiSuggestionCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: AiSuggestionCard 구현**

Props 인터페이스 교체:
```ts
interface Props {
  suggestion: RequestSuggestion;
  onApply: (s: RequestSuggestion) => void;
  onDismiss: () => void;
  onCopyCurl?: (s: RequestSuggestion) => void;
  onSaveVars?: (s: RequestSuggestion) => void;
}
```
구조분해에 `onCopyCurl, onSaveVars` 추가. `ai-suggestion-actions` 안 "무시" 버튼 앞/뒤에 추가:
```tsx
        {onCopyCurl && (
          <button className="btn small" onClick={() => onCopyCurl(suggestion)} title="제안을 cURL 명령으로 복사">
            cURL 복사
          </button>
        )}
        {onSaveVars && (
          <button className="btn small" onClick={() => onSaveVars(suggestion)} title="제안 값을 환경 변수로 저장">
            변수로 저장
          </button>
        )}
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/components/AiSuggestionCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: AiPanel 패스스루** — Props에 `onCopyCurl?: (s: RequestSuggestion) => void; onSaveVars?: (s: RequestSuggestion) => void;` 추가, 구조분해, `<AiSuggestionCard ... onCopyCurl={onCopyCurl} onSaveVars={onSaveVars} />`로 전달(렌더 지점에).

- [ ] **Step 6: App 핸들러 + 전달**

import: `import { buildCurl } from "./core/curl-builder";` (기존 `buildRequest`, `applySuggestion`, `computeSecurityHeaders`, `activeVars`, `log`, `setEnvs` 활용).

```ts
  function copyCurlFromSuggestion(s: RequestSuggestion) {
    if (!selected || !inputs) return;
    const merged = applySuggestion(inputs, s);
    const securityHeaders = computeSecurityHeaders(spec?.securitySchemes ?? [], authValues);
    const request = buildRequest(baseURL, selected, merged, securityHeaders, globalHeaders, activeVars);
    navigator.clipboard?.writeText(buildCurl(request)).then(
      () => log.info("ai", "제안을 cURL로 복사"),
      () => log.warn("ai", "클립보드 복사 실패"),
    );
  }

  function saveVarsFromSuggestion(s: RequestSuggestion) {
    const pairs = { ...(s.pathParams ?? {}), ...(s.queryParams ?? {}) };
    const entries = Object.entries(pairs).filter(([k, v]) => k && v && !v.includes("{{"));
    if (entries.length === 0) return;
    setEnvs((prev) => {
      const env = prev.find((e) => e.baseURL === baseURL);
      if (!env) return prev;
      const vars = [...(env.vars ?? [])];
      for (const [k, v] of entries) {
        const ex = vars.find((x) => x.key === k);
        if (ex) ex.value = v;
        else vars.push({ key: k, value: v });
      }
      return prev.map((e) => (e === env ? { ...e, vars } : e));
    });
    log.info("ai", "제안 값을 환경 변수로 저장");
  }
```

`<AiPanel ... />`에 `onCopyCurl={copyCurlFromSuggestion}` `onSaveVars={saveVarsFromSuggestion}` 추가.

- [ ] **Step 7: 검증**

Run: `cd apps/desktop && npx tsc --noEmit && npm run lint && npm test`
Expected: 전부 통과.

- [ ] **Step 8: 커밋**

```bash
cd apps/desktop && git add src/components/AiSuggestionCard.tsx src/components/AiSuggestionCard.test.tsx src/components/AiPanel.tsx src/App.tsx
git commit -m "기능: AI 제안 cURL 복사 + 환경 변수 저장"
```

---

## Task 10: 실제 claude E2E 스모크 스크립트 (옵트인)

**Files:**
- Create: `apps/desktop/scripts/ai-e2e.ts`
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: 스크립트 작성** — `scripts/ai-e2e.ts`:

```ts
// 실제 claude CLI를 호출해 stream-json/structured_output 포맷 회귀를 감지한다.
// 옵트인: `npm run ai:e2e` (네트워크·비용 발생, CI/`npm test`에서 제외).
import { spawn } from "node:child_process";

function run(args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn("claude", args, { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`exit ${code}`))));
    p.stdin.write(input);
    p.stdin.end();
  });
}

async function main() {
  const stream = await run(
    ["-p", "--output-format", "stream-json", "--include-partial-messages", "--verbose", "--tools", "--strict-mcp-config", "--model", "haiku"],
    "한 단어로 인사",
  );
  const hasTextDelta = stream.split("\n").some((l) => l.includes('"text_delta"'));
  console.log("stream-json text_delta:", hasTextDelta ? "OK" : "FAIL");

  const schema = JSON.stringify({ type: "object", additionalProperties: false, properties: { body: { type: "string" } } });
  const completed = await run(
    ["-p", "--output-format", "json", "--tools", "--strict-mcp-config", "--model", "haiku", "--json-schema", schema],
    "body에 hi 를 넣어줘",
  );
  const obj = JSON.parse(completed);
  const hasStructured = obj.structured_output && typeof obj.structured_output === "object";
  console.log("json-schema structured_output:", hasStructured ? "OK" : "FAIL");

  if (!hasTextDelta || !hasStructured) process.exit(1);
}

main().catch((e) => {
  console.error("E2E 실패:", e);
  process.exit(1);
});
```

- [ ] **Step 2: package.json 스크립트 추가** — `scripts`에 추가(`tsx`가 devDeps에 없으면 npx 형태):

```json
    "ai:e2e": "npx -y tsx scripts/ai-e2e.ts"
```

- [ ] **Step 3: 타입 확인**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: 클린.

- [ ] **Step 4: 커밋**

```bash
cd apps/desktop && git add scripts/ai-e2e.ts package.json
git commit -m "테스트: 실제 claude E2E 스모크 스크립트(옵트인 ai:e2e)"
```

---

## Task 11: 스타일 + 최종 검증 + CHANGELOG

**Files:**
- Modify: `apps/desktop/src/App.css`
- Modify: `apps/desktop/CHANGELOG.md`

- [ ] **Step 1: CSS 추가** — `App.css` AI 섹션에:

```css
.ai-resp-actions {
  display: inline-flex;
  gap: 6px;
  margin-left: 8px;
}
```

- [ ] **Step 2: 시각 확인(수동)**

Run: `cd apps/desktop && npm run tauri dev`
Expected: 요청 전송 → 응답 패널 `✦ 설명`(에러면 `✦ 진단`) → 클릭 시 AI 패널 열리고 자동 질문. 제안 카드에 `cURL 복사`/`변수로 저장`. 재시작 후 같은 프로젝트 대화 복원.

- [ ] **Step 3: CHANGELOG** — `CHANGELOG.md` 맨 위에 v0.3.1 신설:

```markdown
## v0.3.1

- AI: 응답 기반 진단/설명(응답 패널 ✦버튼 · 커맨드 팔레트)
- AI: 프로젝트별 챗 히스토리 영속화(재시작 후 복원)
- AI: 제안을 cURL 복사 · 환경 변수로 저장
- AI: 제안 잉여키 검증(폼 오염 방지) + 컨텍스트(enum/example/응답 스키마) 보강
```

package.json/tauri.conf.json/Cargo.toml 버전도 0.3.1로 올린다.

- [ ] **Step 4: 최종 검증**

Run: `cd apps/desktop && npm test && npm run lint && npx tsc --noEmit`
Expected: 전부 통과.

Run: `cd apps/desktop/src-tauri && cargo test ai::`
Expected: 전부 통과.

- [ ] **Step 5: 커밋**

```bash
cd apps/desktop && git add src/App.css CHANGELOG.md package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "문서: v0.3.1 CHANGELOG/버전 + 응답 AI 액션 스타일"
```

---

## 완료 기준

- [ ] 응답 패널 `✦ 설명`/`✦ 진단` → AI 패널 자동 질문(에러일 때만 진단 노출).
- [ ] 커맨드 팔레트에 AI 응답 설명/진단 항목.
- [ ] 같은 프로젝트(spec) 재방문 시 대화 복원, "새 대화"로 초기화.
- [ ] 제안 카드에서 cURL 복사 / 변수 저장 동작.
- [ ] AI 제안에 op에 없는 query/path 키가 폼에 들어가지 않음.
- [ ] 컨텍스트에 enum/example/응답 스키마 포함.
- [ ] 프론트/러스트 테스트·린트·타입 통과. `npm run ai:e2e`는 수동 옵트인.

## 비포함 (YAGNI)

요청작성 모델 폴백, 응답 표시 UX(구문강조/접기), 멀티 대화 보관, codex 어댑터.
