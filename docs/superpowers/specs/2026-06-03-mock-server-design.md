# Mock 서버 설계

날짜: 2026-06-03
상태: 설계 승인됨 (하이브리드 아키텍처 🅒)

## 배경

- 프론트엔드 개발자가 백엔드 없이 개발하려면 스펙 기반 가짜 API 서버가 필요하다.
- SwaggerMan은 이미 스펙 파서(`ParsedResponse`의 schema/example), AI(Claude CLI), 히스토리(실제 응답)를 갖고 있어 "다양한 응답 데이터"를 만들 재료가 충분하다.
- 외부 클라이언트(브라우저/앱)가 `localhost:PORT`로 직접 호출하는 실제 HTTP 서버여야 한다.

## 목표

1. 로드한 OpenAPI 스펙의 모든 operation을 서빙하는 로컬 Mock HTTP 서버.
2. 응답 데이터를 다양하게 만드는 3가지 소스: **스키마 자동 생성 / AI 데이터셋 / 히스토리 녹화**.
3. 진짜 백엔드 같은 동작: 목록↔단건 일관성(시드), 페이징 자동 처리, 지연/에러 시뮬레이션.

## 비목표 (YAGNI)

- Stateful CRUD(POST가 목록에 반영)는 이번 범위에서 제외 (사용자 미선택).
- 프록시 녹화 모드는 별도 후속 기능 (로드맵 2번).
- HTTPS, 외부 네트워크 바인딩(LAN 노출)은 제외 — localhost 전용.

## 아키텍처 (하이브리드)

**TS가 "데이터셋" 생성, Rust가 "서빙 로직" 담당.**

```
React (TS)                              Rust (axum)
┌───────────────────────┐   Tauri      ┌──────────────────┐
│ 데이터셋 생성           │   command    │ Mock HTTP 서버    │    외부 클라이언트
│ ① 스키마 자동(시드)     │ ──────────→ │ localhost:PORT   │ ←─ 브라우저/앱/curl
│ ② AI(Claude) 생성      │  mock_start │                  │
│ ③ 히스토리 녹화 변환     │  mock_stop  │ 서빙 규칙:        │
└───────────────────────┘  mock_logs  │ · 경로 매칭(path  │
┌───────────────────────┐             │   param 인식)     │
│ MockServerModal (UI)   │ ←────────── │ · 페이징 자동     │
│ 서버 제어·설정·미리보기  │  요청 로그   │ · ID 단건 조회    │
│ ·실시간 요청 로그        │             │ · 지연/강제 에러  │
└───────────────────────┘             │ · CORS 헤더      │
                                       └──────────────────┘
```

- 데이터 생성은 스키마/AI/히스토리에 모두 접근 가능한 TS에서.
- 서빙(라우팅·페이징·매칭)은 실제 HTTP 서버인 Rust에서.

## 컴포넌트

### Rust: `src-tauri/src/mock_server.rs`

- 의존성 추가: `axum` (tokio는 이미 있음).
- Tauri command:
  - `mock_start(config: MockConfig) -> Result<u16>` — 서버 시작, 실제 바인딩된 포트 반환
  - `mock_stop()` — 서버 중지
  - `mock_logs() -> Vec<MockLogEntry>` — 누적 요청 로그 (UI 폴링용)
- `MockConfig` (TS에서 직렬화해 전달):
  ```rust
  struct MockConfig {
    port: u16,
    routes: Vec<MockRoute>,
  }
  struct MockRoute {
    method: String,        // GET/POST/...
    path: String,          // /pets/{petId} — {x}는 와일드카드 매칭
    status: u16,           // 기본 응답 상태코드
    dataset: Option<serde_json::Value>,  // 배열이면 목록/단건/페이징 서빙
    body: Option<serde_json::Value>,     // 고정 응답(단건 operation용)
    delay_ms: u64,
    id_field: Option<String>,            // 단건 조회 시 매칭할 필드명 (기본 "id")
  }
  ```
- 서빙 규칙:
  - dataset(배열)이 있는 GET 컬렉션 경로 → 쿼리에 `page`/`size`(또는 `offset`/`limit`) 있으면 페이징 응답, 없으면 전체 배열
  - path param이 있는 GET 경로(`/pets/{petId}`) → dataset에서 `id_field == 경로값` 아이템 반환, 없으면 404
  - POST/PUT/PATCH/DELETE → `body`(스펙 example 기반) 반환, 없으면 `{"ok": true}` + 상태코드
  - 모든 응답에 CORS 헤더(`Access-Control-Allow-Origin: *`), OPTIONS preflight 처리
  - 매 요청을 로그 버퍼(최근 200개)에 기록: 시간/메서드/경로/상태/소요
- 에러: 포트 충돌 시 `Err("PORT_IN_USE")` → UI가 다른 포트 제안.

### TS core: `core/mock-generator.ts`

- `generateFromSchema(schema: ParsedSchema, opts: { count?: number; seed?: number }): unknown`
  - 타입별 생성: string/number/integer/boolean/array/object/enum
  - **필드명 인식**(도메인 추론): `email`→이메일, `name`/`이름`→사람 이름, `*At`/`date`→ISO 날짜, `phone`→전화번호, `url`/`image`→URL, `price`/`amount`→금액, `id`→순번
  - format 인식: `date-time`/`date`/`email`/`uuid`/`uri`
  - **시드 기반 결정적**: 같은 시드 → 같은 데이터 (mulberry32 같은 단순 PRNG)
- `generateDataset(operation: ParsedOperation, count: number, seed: number): unknown[]`
  - 200 응답 스키마에서 아이템 스키마 추출(배열이면 items, 페이징 래퍼면 content/data/items 속성 인식)

### TS core: `core/mock-config.ts`

- operation별 mock 설정 타입과 localStorage 영속화(프로젝트별 키, 기존 `storage.ts` 패턴):
  ```ts
  interface MockOperationConfig {
    opId: string;
    enabled: boolean;
    source: "schema" | "ai" | "history" | "manual";
    dataset?: unknown[];       // 생성/편집된 데이터셋 (배열 operation)
    body?: unknown;            // 단건 응답
    status: number;
    delayMs: number;
    itemCount: number;         // 자동 생성 개수 (기본 20)
    seed: number;
  }
  interface MockServerConfig {
    port: number;              // 기본 9090
    operations: MockOperationConfig[];
  }
  ```
- `buildMockRoutes(spec, config): MockRoute[]` — Rust로 보낼 형태로 변환.

### TS core: `core/ai/mock-prompt.ts`

- 기존 AI provider(Claude CLI) 재활용.
- 프롬프트: operation 경로/설명/응답 스키마 + "현실적인 한국어 데이터 N개를 JSON 배열로" → 파싱/검증 후 dataset으로 저장.
- AI 미설정/실패 시 스키마 자동 생성으로 폴백.

### UI: `components/MockServerModal.tsx`

- 상단바 "Mock" 버튼으로 열기 (기존 모달 패턴).
- 상단: 서버 상태(중지/실행 중 :포트), 포트 입력, [서버 시작/중지] 버튼, base URL 복사 버튼
- 본문: operation 목록 (메서드/경로/활성 토글)
  - 행 선택 시: 데이터 소스 선택(자동 생성/AI 생성/히스토리/직접 편집), 아이템 수, 상태코드, 지연
  - 데이터셋 미리보기(JSON) + 직접 편집 가능
  - 히스토리 소스: 해당 operation의 히스토리 목록에서 선택 → 응답 body를 dataset/body로 변환
- 하단: 실시간 요청 로그 (1초 폴링, 메서드/경로/상태/시간)

## 데이터 흐름

1. 모달 열기 → 저장된 MockServerConfig 로드 (없으면 모든 operation enabled=true, source=schema 기본값)
2. 데이터 소스 변경/생성 → dataset 갱신 → localStorage 저장
3. "서버 시작" → `buildMockRoutes()` → `mock_start(config)` → 포트 반환 → UI에 "실행 중 :9090" 표시
4. 외부 호출 → Rust 서빙 → 로그 버퍼 적재 → UI 폴링으로 로그 표시
5. 스펙 다시 로드/변경 시 → 서버 실행 중이면 자동 재시작(새 라우트 반영)

## 에러 처리

- 포트 충돌: "포트 9090이 사용 중입니다" + 자동으로 +1 포트 제안
- 스펙 미로드: Mock 버튼 비활성화(title로 안내)
- AI 생성 실패/미설정: 에러 메시지 + 스키마 자동 생성 폴백
- 데이터셋 직접 편집 시 JSON 파싱 에러: 인라인 에러 표시, 저장 차단
- 앱 종료 시: Tauri lifecycle에서 서버 자동 중지

## 테스트

- `mock-generator.test.ts`: 타입별 생성, 필드명 인식(email/날짜/이름), 시드 일관성(같은 시드=같은 결과), 페이징 래퍼 스키마 인식
- `mock-config.test.ts`: 설정 저장/복원, buildMockRoutes 변환(path param, 단건/목록 구분)
- `MockServerModal.test.tsx`: 렌더링, 소스 전환, 서버 시작/중지 버튼 (Tauri command는 mock)
- Rust `mock_server.rs` `#[cfg(test)]`: 경로 매칭(`/pets/{id}`), 페이징 계산, 404 처리
- 수동 통합 테스트: 서버 시작 → `curl localhost:9090/...`로 목록/단건/페이징/404 확인

## 후속 로드맵 (이 스펙 범위 아님)

1. ~~Mock 서버~~ (이 스펙)
2. 프록시 녹화 모드 — Rust 서버 재활용, 실서버 전달+녹화
3. API 성능 추이 — 히스토리 기반 응답시간 차트
4. 가이드 문서 생성 — 스펙+히스토리 예시 → Markdown/HTML
5. API 시간여행 — 주기 스냅샷 + 시간축 탐색
6. 플로우 빌더 — 노드 캔버스 시나리오 구성
