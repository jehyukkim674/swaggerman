# SwaggerMan AI 어시스턴트 2차 개선 — 설계

- 작성일: 2026-05-31
- 대상: `apps/desktop` (Tauri 2 + React 19 + TypeScript)
- 상태: 설계 승인됨 (구현 계획 대기)
- 선행: `2026-05-31-ai-assistant-design.md`(M1) 위에 쌓는 2차 개선. 브랜치 `feat/ai-assistant`.

## 1. 목적

M1(채팅 패널 + 요청 작성 도우미)과 이후 라이브 피드백으로 추가한 기능들
(토큰 표시·폴딩·인디케이터·도구 격리·하이라이팅) 위에, 다음을 더한다.

1. **응답 기반 AI** — 받은 응답을 컨텍스트로 "왜 실패했나(진단)" / "이 응답 설명"을 1클릭.
2. **챗 히스토리 영속화** — 프로젝트(spec)별 대화 1개를 재시작 후에도 유지.
3. **제안 다양화** — AI 제안을 폼 적용 외에 cURL 복사·환경변수 저장으로도 활용.
4. **테스트 보강** — 프론트 엣지케이스 + Rust `ai_chat` 통합 + 실제 claude E2E 스모크.
5. **응답 품질** — 잉여키 검증(폼 오염 방지) + 프롬프트 정밀화 + 컨텍스트 보강.

## 2. 배경 / 확인된 사실 (라이브 실측)

이번 세션에서 실제 `claude` CLI를 호출해 관찰·확정한 것:

- claude를 도구 제한 없이 `-p`로 호출하면 사용자 환경의 MCP/Bash를 물려받아
  **에이전트로 행동**(실제 DB 조회 시도 등), `num_turns` 3~5로 느리고 엉뚱한
  응답을 냈다. → 이미 `--tools`(빈 목록) + `--strict-mcp-config`로 차단(num_turns 1).
- `--json-schema` 결과는 `result`가 아니라 **`structured_output`**(파싱된 객체)에
  담긴다. → Rust `extract_structured` + 프론트 `parseSuggestion`이 처리 중.
- haiku는 스키마를 느슨히 따라 (a) `body`에 마크다운 코드펜스, (b) dict에 스키마에
  없는 **잉여 키**(예: `queryParams.endpoint`)를 넣기도 한다. (a)는 처리됨, (b)는 미처리.
- stream-json 텍스트 델타 = `stream_event` → `content_block_delta` → `text_delta`.
  `result` 라인에 `usage.input_tokens/output_tokens`, `total_cost_usd` 포함.

### 재사용할 기존 코드 (확인됨)
- `core/curl-builder.ts`: `buildCurl(request: HTTPRequest): string` — 요청→cURL 문자열.
- `core/request-builder.ts`: `buildRequest(baseURL, op, inputs, securityHeaders,
  globalHeaders, vars) → HTTPRequest`, `RequestInputs`, `RequestParam`.
- `core/ai/context.ts`: `buildAiContext({op, inputs, response, envVarNames, baseURL})`.
  `ParsedSchema`에 `enumValues?`, `example?`, `required?`가 있다(보강에 사용).
- `core/ai/schema.ts`: `parseSuggestion`, `applySuggestion`, `requestSuggestionSchema`.
- `core/ai/types.ts`: `RequestSuggestion`, `AiEvent`, `AiChatRequest` 등.
- `components/AiPanel.tsx`: 메시지/스트리밍/`/요청`/토큰/인디케이터/`detectMentions`.
- `components/ResponseView.tsx`, `components/CommandPalette.tsx`, `App.tsx`.
- 영속화: `core/storage.ts`의 `loadJSON/saveJSON`(키 `"swaggerman."` 접두).

## 3. 확정 결정

| 항목 | 결정 |
|---|---|
| 응답 AI 진입점 | ResponseView 버튼 **+** 커맨드 팔레트(⌘K) 둘 다 |
| 챗 히스토리 단위 | 프로젝트(spec URL)별 **1개** 대화. "새 대화"가 저장본도 비움 |
| 제안 다양화 | `[폼에 적용]`(기존) + `[cURL 복사]` + `[변수로 저장]` |
| 테스트 | 3종 모두(프론트 엣지 + Rust ai_chat 통합 + 실제 E2E 옵트인) |
| 응답 품질 | ②잉여키 검증 + ④프롬프트 정밀화 + ①컨텍스트 보강 (③폴백·⑤표시UX 제외) |

## 4. 그룹별 설계

각 그룹은 독립 구현·테스트 가능하다. 신규 순수 로직은 모두 `core/ai/`에 모은다.

### 그룹 A — 응답 기반 AI (에러 진단 / 설명)

**신규 `core/ai/prompts.ts`(순수)**
- `diagnosePrompt(): string` — "직전 응답의 상태코드와 본문을 근거로 왜 이 결과가
  났는지, 어떻게 고칠지 한국어로 진단하라." (컨텍스트는 buildAiContext가 응답 포함)
- `explainPrompt(): string` — "직전 응답 본문을 한국어로 간결히 요약/설명하라."
- 순수 상수 빌더라 테스트는 "특정 키워드 포함" 수준.

**데이터 흐름 (자동 전송)**
- App에 `aiPendingPrompt: string | null` 상태. ResponseView/팔레트가 트리거하면
  ① `setAiOpen(true)` ② `setAiPendingPrompt(diagnosePrompt())`.
- AiPanel은 새 prop `pendingPrompt?: string`과 `onPendingConsumed?: () => void`를 받아,
  값이 새로 들어오면(useEffect, 값 변화 감지) 그 프롬프트로 **자동 send(chat 경로)** 후
  `onPendingConsumed()`로 App이 null로 되돌린다. 중복 전송 방지(consume 패턴).

**UI**
- `ResponseView` 상단(탭 영역 근처): `✦ 설명` 버튼 항상, `✦ 진단` 버튼은
  `response && statusCode >= 400`일 때만. 응답 없으면 숨김/비활성.
- `CommandPalette`: 항목 "AI: 응답 설명", "AI: 응답 진단"(에러일 때만 노출).
  팔레트는 현재 op/response를 알므로 App 핸들러를 통해 위 트리거 호출.

**에러 처리**: 응답이 없으면 버튼 비활성. claude 미발견 등은 기존 AiPanel 에러 경로.

### 그룹 B — 챗 히스토리 영속화 (프로젝트별 1개)

**신규 `core/ai/history.ts`(순수)**
- `interface StoredChat { messages: StoredMessage[]; sessionId?: string;
  totals: { input: number; output: number } }` (StoredMessage = role/text/
  suggestion?/usage? — AiPanel의 Message와 동형, 단 직렬화 안전 형태).
- `loadChat(specUrl): StoredChat | null` / `saveChat(specUrl, chat): void` —
  내부적으로 `loadJSON/saveJSON` 사용, 키 `swaggerman.aichat.<specUrl>`.
- `clearChat(specUrl): void`.
- 역직렬화 시 형태 가드(필드 누락/타입 불일치 → 무시하고 빈 대화).

**AiPanel 연동**
- 새 prop `specUrl?: string`. 마운트/ specUrl 변경 시 `loadChat`으로 messages·
  sessionRef·totals 복원. messages/totals 변경 시 `saveChat`(작아서 디바운스 불필요).
- `reset()`(새 대화)은 상태 비움 + `clearChat(specUrl)`.
- App은 `activeSpecUrl`을 prop으로 전달. 프로젝트 전환 시 자동으로 그 대화 로드.

> 주의: AiPanel은 현재 App에서 항상 마운트(폴딩 시 display:none)되므로, specUrl이
> 바뀌면 같은 인스턴스에서 useEffect로 교체 로드한다.

### 그룹 C — 제안 다양화 (cURL / 변수)

**AiSuggestionCard 액션 추가**
- 기존 `onApply`/`onDismiss`에 더해 `onCopyCurl?: (s) => void`,
  `onSaveVars?: (s) => void` prop. 버튼 `[cURL 복사]`, `[변수로 저장]` 추가.
- App 핸들러:
  - cURL: 제안을 현재 inputs에 `applySuggestion`으로 합친 뒤
    `buildRequest(...)` → `buildCurl(request)` → 클립보드 복사(`navigator.clipboard`).
    (실행은 안 함 — 문자열 생성만.)
  - 변수 저장: 제안의 query/path/header 값들을 현재 환경의 `vars`에 `key=value`로
    upsert(기존 EnvVar 구조 재사용). 빈 값/변수참조(`{{...}}`)는 건너뜀.
- 클립보드 성공/실패는 가벼운 토스트 또는 패널 내 일시 메시지로 표기.

### 그룹 D — 테스트 보강

1. **프론트 엣지케이스**: 신규 `prompts.ts`/`history.ts`/그룹 E의
   `filterKnownParams` 단위 테스트 + 기존 context/schema/detectMentions 경계값 추가.
2. **Rust `ai_chat` 통합**: `Channel`은 webview 런타임 없이 cargo 테스트에서
   생성하기 어렵다(확정된 제약). 따라서 ai_chat 전체 spawn은 테스트하지 않고, 대신
   **여러 줄짜리 mock stream-json을 `parse_stream_line`으로 순서대로 처리하면 기대한
   이벤트 시퀀스(여러 Delta → Done(+usage))가 나온다**를 검증하는 Rust 테스트를
   추가한다. 즉 "스트림 한 줄"이 아니라 "스트림 전체 시퀀스"의 파싱을 커버한다.
   (전체 프로세스 spawn 통합은 ai_complete가 이미 mock claude로 커버.)
3. **실제 claude E2E 스모크**: `scripts/ai-e2e.ts`(또는 .sh) — 옵트인. 실제 claude를
   호출해 (a) stream-json 텍스트 델타 추출, (b) `--json-schema` → structured_output
   형태를 확인하고 회귀를 감지. `package.json`에 `"ai:e2e"` 스크립트. **CI/`npm test`
   에는 포함하지 않음**(네트워크·비용·환경 의존).

### 그룹 E — 응답 품질

**② 잉여키 검증 — `core/ai/schema.ts`에 `filterKnownParams` 추가(순수)**
- `filterKnownParams(suggestion: RequestSuggestion, opParamNames: string[]):
  RequestSuggestion` — query/path/header dict에서 `opParamNames`에 **없는 키 제거**.
  body/notes는 그대로. (path는 op의 path 파라미터명, query/header도 op 파라미터명과
  대조. op에 없는 헤더는 사용자가 의도적으로 추가할 수도 있으므로 **query/path만
  엄격 필터, header는 통과**시키는 것을 기본으로 한다 — 헤더는 표준 헤더가 많음.)
- AiPanel이 제안을 만들 때(`handleRequestBuild`/`fillFormFor`) parse 후
  `filterKnownParams(suggestion, paramNames)`를 적용. `paramNames`는 이미 AiPanel의
  기존 prop(언급 강조 기능에서 App이 현재 op의 파라미터명을 전달)이라 재사용한다.

**④ 프롬프트 정밀화 — AiPanel `REQUEST_SYSTEM` 보강**
- "제공된 파라미터 목록에 없는 키는 만들지 마라. 모르면 비워 둬라"를 명시.
  (현재 프롬프트에 도구금지·JSON only·코드펜스금지는 이미 있음.)

**① 컨텍스트 보강 — `core/ai/context.ts` 확장**
- 파라미터 출력에 `enumValues`(있으면 "(enum: a|b|c)"), `example`/`defaultValue`를
  덧붙임. 요청 본문 스키마에 더해 **성공 응답(2xx) 스키마 outline**도 짧게 포함
  (있으면). 길이 상한(MAX_BODY 등) 유지. 보안: 값이 아닌 스키마/이름만.

## 5. 구현 순서 (의존성)

1. **E-context 보강 + E-schema `filterKnownParams`** (순수, 다른 그룹 기반)
2. **D-Rust 통합** (백엔드 신뢰 확보, 독립 파일)
3. **B 히스토리** (`history.ts` + AiPanel 영속화)
4. **A 응답기반** (`prompts.ts` + ResponseView/팔레트/App/AiPanel pending)
5. **C 제안다양화** + **E-프롬프트** (AiSuggestionCard/AiPanel)
6. **D-프론트/E2E 테스트** (전체 안정화 후)

## 6. 파일 구조 요약

**신규**
- `apps/desktop/src/core/ai/prompts.ts` (+ test)
- `apps/desktop/src/core/ai/history.ts` (+ test)
- `apps/desktop/scripts/ai-e2e.ts` (옵트인 E2E, 테스트 스위트 제외)

**수정**
- `core/ai/schema.ts` — `filterKnownParams` 추가 (+ test)
- `core/ai/context.ts` — enum/example/응답스키마 보강 (+ test 케이스)
- `components/AiPanel.tsx` — pendingPrompt 자동전송, history 연동, filterKnownParams
  적용, REQUEST_SYSTEM 보강
- `components/AiSuggestionCard.tsx` — cURL/변수 액션
- `components/ResponseView.tsx` — ✦설명/✦진단 버튼
- `components/CommandPalette.tsx` — AI 응답 설명/진단 항목
- `App.tsx` — aiPendingPrompt 상태, ResponseView/팔레트 핸들러, AiPanel에 specUrl/
  pendingPrompt 전달, cURL/변수 저장 핸들러
- `src-tauri/src/ai.rs` — ai_chat 통합 테스트(가능 범위)
- `package.json` — `ai:e2e` 스크립트
- `apps/desktop/src/App.css` — 신규 버튼/토스트 스타일

## 7. 테스트 전략

- 순수 모듈(prompts/history/filterKnownParams/context 보강): Vitest 단위, 기존
  `core/*.test.ts` 패턴. 직렬화 라운드트립·잉여키 제거·경계값.
- 컴포넌트(AiPanel pending 자동전송, AiSuggestionCard 새 액션): jsdom + RTL.
  콜백 호출·자동 send 검증. 클립보드는 `navigator.clipboard` mock.
- Rust: parse_stream_line 시퀀스/가능 시 spawn 통합.
- E2E 스모크: 수동(`npm run ai:e2e`), CI 제외.

## 8. 비포함 (YAGNI)

③ 요청작성 모델 폴백, ⑤ 응답 표시 UX(구문강조/접기), 멀티 대화 보관·목록,
codex 어댑터, 응답 외 자동 액션(AI가 직접 전송).

## 9. 위험 / 주의

- 클립보드 API는 웹뷰 보안 컨텍스트 필요 — Tauri webview에서 동작 확인 필요
  (안 되면 Rust 커맨드로 클립보드 쓰기 폴백 고려, 단 이번 범위에선 navigator 우선).
- 헤더 잉여키 필터를 너무 엄격히 하면 사용자가 원하는 커스텀 헤더가 잘릴 수 있어
  query/path만 엄격 필터(§4-E 참조).
- 히스토리 직렬화에 suggestion 객체가 포함되므로 형태 가드 필수(깨진 저장본 방어).
- pendingPrompt 자동전송은 consume 패턴으로 중복/재전송 방지.
