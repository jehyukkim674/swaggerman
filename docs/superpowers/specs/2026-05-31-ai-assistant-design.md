# SwaggerMan AI 어시스턴트 — 설계

- 작성일: 2026-05-31
- 대상: `apps/desktop` (Tauri 2 + React 18 + TypeScript + Vite)
- 상태: 설계 승인됨 (구현 계획 대기)

## 1. 목적

현재 보고 있는 OpenAPI 엔드포인트를 컨텍스트로, 로컬에 설치된 `claude` CLI와
대화하는 우측 슬라이드 패널을 추가한다. 두 가지 가치를 제공한다.

1. **스펙 Q&A** — "이 엔드포인트 뭐해?", "왜 401 났어?", "이 스키마 필드 설명해줘"
2. **요청 작성 도우미** — "재고 10개로 상품 생성해줘" → AI가 요청 폼(method/path
   params/query/headers/body)을 채운 제안을 주고, 사용자가 검토 후 적용

이후 마일스톤에서 같은 인프라 위에 **AI 자동완성**(인라인 + 필드별 값 제안)을 얹는다.

## 2. 배경 / 현재 코드베이스 사실

- 활성 코드베이스는 `apps/desktop`. 과거 `SwaggerMan/`(Swift)은 이식 완료된 구버전.
- Rust 백엔드(`src-tauri/src/lib.rs`)는 커스텀 `tauri::command` 패턴을 이미 사용
  중이다: `http_request`, `list_cookies`, `clear_cookies`, `read_text_file`,
  `write_text_file`. HTTP는 webview가 아니라 Rust(`reqwest`)에서 처리한다.
- 현재 Tauri 플러그인: `opener`, `dialog`, `updater`(desktop), `process`(desktop).
  **`tauri-plugin-shell`은 없다.**
- 프론트 상태는 모두 `App.tsx`에 모여 있고, 레이아웃은
  `react-resizable-panels`의 `PanelGroup`(가로 3분할: Sidebar / RequestEditor /
  ResponseView)다.
- 도메인 타입은 `core/types.ts`에 정의: `ParsedOperation`, `ParsedParameter`,
  `ParsedRequestBody`, `ParsedResponse`, `ParsedSchema`, `HTTPRequest`,
  `HTTPResponse` 등. 요청 입력은 `core/request-builder.ts`의 `RequestInputs`.
- Body 에디터(`components/JsonEditor.tsx`)는 `textarea` 위에 `<pre>` 하이라이트
  레이어를 겹친 **커스텀** 에디터(CodeMirror/Monaco 아님). → ghost text는 레이어를
  한 겹 더 얹어 구현한다.
- 변수 자동완성(`components/VarInput.tsx`)이 이미 `{{` 입력 시 드롭다운 제안 UX를
  구현해 둠 → 필드별 값 제안 UX의 선례로 재사용한다.
- 디자인 토큰(`App.css` `:root`): `--bg #0d1117`, `--bg-2 #161b22`,
  `--bg-3 #21262d`, `--border #30363d`, `--text #e6edf3`, `--muted #9aa4af`,
  `--accent #388bfd`. 라이트 테마 토큰도 `[data-theme=light]`로 존재.

### CLI 가용성 (확인됨)
- `claude`: 설치됨 (`2.1.158 (Claude Code)`). 경로는 환경에 따라 비표준일 수 있음
  (이 머신에선 `/Applications/cmux.app/Contents/Resources/bin/claude`가 PATH 우선,
  `~/.claude/local/claude`도 존재).
- `codex`: 설치됨 (`/opt/homebrew/bin/codex` → `@openai/codex`, `codex-cli 0.132.0`).
- 활용할 `claude` 헤드리스 플래그: `-p/--print`, `--output-format`
  (`text|json|stream-json`), `--input-format`, `--json-schema <schema>`(구조화
  출력), `--append-system-prompt`, `--model`, `--session-id`, `--resume`,
  `--include-partial-messages`, `--no-session-persistence`.

## 3. 확정 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 통신 방식 | 로컬 `claude` CLI를 자식 프로세스로 실행 | "claude/codex랑 통신" 의도, 기존 로그인/구독 사용, API 키 불필요 |
| 실행 위치 | Rust 커스텀 커맨드 (shell plugin 미사용) | 기존 `http_request` 패턴과 일관, 의존성/권한 scope 추가 없음 |
| 첫 버전 범위 | Q&A + 요청 작성 도우미 | 사용자 선택(1+2) |
| 제공자 구조 | `AiProvider` 인터페이스 + `claude` 어댑터 1차 | codex 등 확장을 어댑터 추가로 흡수 |
| 컨텍스트 범위 | 현재 엔드포인트 중심 | 토큰 효율, 대부분의 질문에 충분 |
| UI 배치 | 우측 슬라이드 패널 (토글) | 엔드포인트 보며 대화 + 즉시 폼 적용 |
| 자동완성(M2) | ① 트리거형 인라인(⌘.) + ② 필드별 값 제안(✦) | 순수 CLI로 충분(③ 디바운스 실시간 제외 → API 하이브리드 불필요) |
| 폼 적용 | 자동 적용 안 함 — diff 미리보기 + [폼에 적용] 버튼 | AI는 제안만, 상태 변경/실행은 사람 |
| 모델 정책 | 대화=sonnet/opus(설정 가능), 자동완성·필드제안=haiku | 자동완성은 지연 민감 → 빠른 모델 |

## 4. 아키텍처

### 4.1 Rust 백엔드 (`src-tauri/src/lib.rs`)

기존 커맨드 옆에 AI 커맨드를 추가하고 `invoke_handler`에 등록한다.

- `ai_chat(args: AiChatArgs, on_event: Channel<AiEvent>) -> Result<(), String>`
  - `claude -p --output-format stream-json --include-partial-messages
    --model <model> [--session-id <id> | --resume <id>] --append-system-prompt
    <system>` 실행, 프롬프트는 stdin 또는 인자로 전달.
  - 자식 프로세스 stdout을 라인 단위로 읽어 파싱한 뒤 `Channel`로 프론트에 push:
    `AiEvent`는 `{ kind: "delta", text }`, `{ kind: "done", sessionId, usage? }`,
    `{ kind: "error", message }` 정도의 합(sum) 타입.
  - 취소: 프론트가 커맨드를 중단하면 자식 프로세스를 kill (요청별 핸들 보관).
- `ai_complete(args: AiCompleteArgs) -> Result<String, String>`
  - 단발 호출. `claude -p --output-format json --json-schema <schema>
    --model <model> ...`로 구조화 출력을 받아 그대로 문자열 반환(프론트가 파싱·검증).
  - **요청 작성 도우미(5.2, M1)** 와 자동완성·필드별 값 제안(5.4, M2)에서 사용.
    요청 작성 도우미는 모델을 설정값으로, 자동완성·필드 제안은 haiku로 호출.
- `ai_detect() -> AiDetect`
  - claude/codex 실행 경로 후보를 탐색(`which` 동작 + 알려진 경로) 후 가용성과
    버전을 반환. 설정에서 사용자가 경로를 수동 지정하면 그 값을 우선.

> 스트리밍 표준은 Tauri 2의 `tauri::ipc::Channel<T>`를 사용한다(요청-스코프
> 콜백 채널). `--output-format stream-json`의 각 라인은 JSON 객체이며,
> `--include-partial-messages` 사용 시 부분 텍스트 이벤트가 도착한다 — 텍스트
> 델타만 추출해 `delta`로 전달한다.

### 4.2 프론트 코어 (`apps/desktop/src/core/ai/`)

각 모듈은 단일 책임을 가지며 독립 테스트 가능하게 둔다.

- `provider.ts` — 인터페이스 정의
  ```ts
  interface AiProvider {
    id: "claude" | "codex";
    displayName: string;
    available: boolean;
    // 스트리밍 대화. onEvent로 delta/done/error 전달, 취소 함수 반환.
    chat(req: AiChatRequest, onEvent: (e: AiEvent) => void): AiHandle;
    // 단발 구조화 출력(자동완성/필드 제안).
    complete<T>(req: AiCompleteRequest, schema: JSONSchema): Promise<T>;
  }
  ```
- `claude.ts` — `AiProvider`의 claude 구현. Rust 커맨드(`ai_chat`/`ai_complete`)를
  invoke하고 `Channel`을 연결한다.
- `codex.ts` — 인터페이스 골격만(미구현 stub). M1에서는 비활성.
- `context.ts` — `ParsedOperation` + 현재 `RequestInputs` + 활성 환경 변수 **이름**
  (값 제외) + (있으면) 직전 `HTTPResponse` 요약 → 시스템 프롬프트/컨텍스트 블록
  문자열로 조립. 순수 함수.
- `schema.ts` — 요청 폼 채우기용 JSON Schema(아래 5.2의 `RequestSuggestion`)와,
  AI 응답을 파싱·검증해 `RequestInputs`로 안전 변환하는 함수. 순수 함수.
- `models.ts` — 모델 목록/기본값, 작업별 모델 정책(대화 vs 자동완성).

### 4.3 프론트 UI (`apps/desktop/src/components/`)

- `AiPanel.tsx` — 우측 패널. `App.tsx`의 `PanelGroup`에 토글되는 `Panel`을 추가
  (열림 상태는 localStorage 영속). 구성: 메시지 리스트(스트리밍 표시) + 입력창 +
  모델/제공자 선택 + "새 대화" 버튼. 일반 메시지는 `chat`(스트리밍 Q&A)으로,
  "요청 생성" 액션(입력창 버튼 또는 `/요청` 접두)은 `complete`(구조화)로 라우팅하고
  결과를 `AiSuggestionCard`로 렌더한다.
- `AiSuggestionCard.tsx` — 요청 작성 도우미 결과를 diff 미리보기(현재 폼 vs 제안)로
  보여주고 `[폼에 적용]` / `[무시]` 제공.
- `App.tsx` 변경: AI 패널 토글 상태, 현재 op/inputs/response를 `context.ts`에 전달,
  `[폼에 적용]` 시 `setInputs(...)` 호출(기존 상태 흐름 재사용, 실행은 하지 않음).

## 5. 데이터 흐름 & 모델

### 5.1 Q&A
```
사용자 질문
  → context.ts: 현재 op 스펙 + 폼 + 환경변수명 + 직전 응답 요약을 시스템 컨텍스트로
  → claude.ts.chat() → Rust ai_chat → claude -p stream-json
  → Channel delta 스트리밍 → AiPanel 메시지에 실시간 렌더
  → done(sessionId 저장 → 후속 메시지는 --resume)
```

### 5.2 요청 작성 도우미

트리거는 "요청 생성" 액션(입력창 버튼 또는 `/요청` 접두)이며, 일반 대화(Q&A)와
명확히 구분된다 — Q&A는 스트리밍 텍스트, 요청 작성은 단발 구조화 출력이다.
```
"재고 10개로 상품 생성"
  → context.ts 컨텍스트 + RequestSuggestion JSON Schema
  → claude.ts.complete<RequestSuggestion>() → Rust ai_complete (--json-schema)
  → schema.ts: 파싱·검증 → RequestInputs로 변환
  → AiSuggestionCard: diff 미리보기 + [폼에 적용]
  → 적용 시 App.setInputs(...) (실행 X; 사용자가 ⌘Enter로 실행)
```

`RequestSuggestion`(개략): `{ pathParams?: Record<string,string>,
queryParams?: Record<string,string>, headers?: Record<string,string>,
body?: string, notes?: string }`. 모든 필드 선택적, 현재 엔드포인트 스키마에
맞춰 검증. 알 수 없는/잉여 필드는 폐기.

### 5.3 세션 연속성
- AI 패널은 하나의 대화 세션을 유지한다. 첫 메시지에서 `--session-id <uuid>`로
  세션을 만들고, 이후 메시지는 `--resume <uuid>`로 이어간다.
- 엔드포인트를 전환해도 대화는 유지하되, 매 메시지에 현재 엔드포인트 컨텍스트를
  동봉해 최신 맥락을 반영한다. "새 대화" 버튼으로 세션을 리셋한다.

### 5.4 자동완성 (M2)
- **① 트리거형 인라인**: body 에디터에서 `⌘.`(또는 버튼) → `ai_complete`로 커서
  위치/현재 폼 기준 나머지 본문 생성 → `JsonEditor`에 ghost text 오버레이로 표시 →
  `Tab` 수락 / `Esc` 취소. 누를 때만 호출하므로 지연·사용량 통제.
- **② 필드별 값 제안**: 각 파라미터/ body 필드 옆 `✦` 버튼 → 그 필드에 맞는 샘플
  값 1개 생성 → `VarInput` 드롭다운 패턴과 동일한 방식으로 채움.

## 6. 안전 · 에러 · 설정

- claude는 항상 `--print` 비대화형으로 실행하며, 파일 수정/권한이 필요한 동작을
  시키지 않는다(순수 텍스트/구조화 출력 생성만). AI는 앱 상태를 "제안"으로만
  바꾸고, 실제 HTTP 실행은 언제나 사람이 한다.
- 작업 디렉토리(cwd)는 중립적인 임시 경로로 고정한다(프로젝트 파일 접근 불필요).
- 에러 처리: CLI 미발견 / 실행 실패 / 타임아웃 / 비정상 종료 → 패널에 명확한 한국어
  메시지 + 재시도. 미발견 시 설정에서 경로를 지정하도록 안내.
- 설정(`SettingsModal` 확장 또는 AI 전용 섹션): claude/codex 경로, 기본 모델,
  자동완성 모델(haiku), AI 기능 on/off.
- 비밀값 주의: 컨텍스트에는 환경 변수 **이름만** 넣고 값(토큰 등)은 보내지 않는다.

## 7. 테스트 전략

- `context.ts` / `schema.ts` / `models.ts`: 순수 함수 단위 테스트(Vitest, 기존
  `core/*.test.ts` 패턴). 컨텍스트 조립, 스키마 검증, 잉여/누락 필드 처리, 비밀값
  제외를 검증.
- Rust `ai_chat`/`ai_complete`: 실제 claude 대신 **mock claude 스크립트**(정해진
  stream-json/JSON을 stdout으로 내는 셸/노드 스크립트)를 경로로 주입해 통합 테스트
  (stdout 파싱, Channel 이벤트 순서, 취소 시 kill, 에러 매핑).
- UI(`AiPanel`/`AiSuggestionCard`): 핵심 렌더/상호작용 스모크 테스트.

## 8. 마일스톤

- **M1 — 채팅 패널**: Rust `ai_chat`/`ai_complete`/`ai_detect` + `core/ai`
  (provider/claude/context/schema/models) + `AiPanel`/`AiSuggestionCard` + Q&A +
  요청 작성 도우미(`ai_complete` 구조화 출력) + 세션 유지 + 설정/에러 + 테스트.
- **M2 — 자동완성**: M1에서 도입한 `ai_complete`를 재사용. ① 인라인 ghost
  text(JsonEditor 오버레이 + ⌘.) ② 필드별 ✦ 제안 + 테스트.

## 9. 비포함 (YAGNI)

③ 디바운스 실시간 자동완성, API(Anthropic/OpenAI) 직접 호출, 자율 테스트 에이전트
(여러 요청 자동 실행), MCP 연동, 멀티 대화 탭/히스토리 보관, codex 어댑터 실구현.

## 10. 미해결 / 위험

- claude `stream-json` + `--include-partial-messages`의 정확한 라인 스키마는 구현
  시 실측으로 확정한다(부분 텍스트 이벤트의 필드명/구조).
- `--json-schema`가 거부/부분 준수하는 경우의 폴백(자유 텍스트에서 JSON 추출)
  필요 여부는 구현 중 검증.
- claude 경로가 환경마다 다르므로 탐지 로직은 여러 후보 + 수동 지정으로 견고하게.
- 첫 호출 콜드스타트 지연(프로세스 시작 + 추론)은 스트리밍 표시와 로딩 인디케이터로
  체감 완화.
