# 프록시 Okta 대응 + Mock 일괄 저장 + 컬렉션 요청 수정 + baseURL 유지

- 날짜: 2026-06-10
- 상태: 설계 승인됨

## 문제 (4건 묶음)

1. **프록시가 Okta 보호 API를 못 넘긴다**: 녹화 프록시(`proxy_server.rs`)는
   응답 헤더 중 Content-Type만 보존하고 **Set-Cookie·Location을 버린다**. 포워딩
   클라이언트(reqwest)가 **리다이렉트를 자동 추적**해 클라이언트는 302 대신 Okta 로그인
   HTML을 받는다. CORS도 `*` 고정이라 쿠키 포함 요청은 브라우저가 차단한다. 또한 설정의
   "SSL 검증 끄기(insecure)"가 프록시 포워딩에는 적용되지 않아 **사내망(GW Root CA)에서
   https 타깃이 502**가 난다.
2. **프록시 녹화 → Mock 저장이 한 건씩만 된다**: 녹화 항목마다 "Mock으로"를 클릭해야 한다.
3. **컬렉션 저장 요청을 수정할 수 없다**: 불러오기·삭제만 가능. URL(http→https), 이름,
   헤더 등을 고치려면 지우고 다시 저장해야 한다.
4. **baseURL을 바꿔도 되돌아간다**: 스펙을 로드할 때마다(`App.tsx` 공용 적용부)
   `servers`에서 baseURL을 **다시 계산해 덮어쓴다**. 사용자가 https로 바꿔도 앱 재시작·
   프로젝트 전환 시 http로 원복된다.

## 목표 / 결정 사항 (사용자 확정)

- **A. 녹화 전체 → Mock 일괄 저장** 버튼 (같은 operation 중복 녹화는 최신이 이김)
- **B. 컬렉션 저장 요청 수정 — 둘 다**: 인라인(이름·메서드·URL) + 라운드트립
  ("불러온 요청에 덮어쓰기"로 헤더·바디 포함 전체 갱신)
- **C. baseURL 프로젝트별 저장/복원** + "스펙 기본값으로" 리셋 버튼
- **D. 프록시 개선 — 둘 다**: ① 네트워크 설정(insecure·아웃바운드 프록시·타임아웃) 적용
  ② 쿠키/리다이렉트 패스스루(Set-Cookie·Location 전달, 자동 추적 끄기, CORS credentials)

한계(명시): **완전한 Okta 브라우저 SSO는 보장 못 한다.** Okta 앱에 `http://localhost:포트`
콜백/Origin 등록이 돼 있어야 로그인 왕복이 성립한다. 프록시가 해줄 수 있는 것은
(a) 토큰(Authorization 헤더) 통과 — 이미 동작, (b) TLS/쿠키/리다이렉트를 투명하게
전달해 "막는 쪽"이 되지 않는 것까지다.

---

## A. 프록시 녹화 전체 → Mock 일괄 저장

### core — `src/core/proxy-to-mock.ts`

```ts
export interface BulkMockResult {
  targets: MockTarget[]; // opId 중복 제거됨(나중 녹화 = 최신이 이김)
  unmatched: number;     // 스펙에 매칭 안 된 녹화 수
  failed: number;        // error가 있는 녹화 수(변환 제외)
}
export function recordingsToMocks(spec: ParsedSpec, records: ProxyRecord[]): BulkMockResult;

/** 변환 결과를 MockServerConfig에 반영(enabled=true, source="manual", dataset/body 설정). */
export function applyMockTargets(cfg: MockServerConfig, targets: MockTarget[]): void;
```

- `records`는 시간순(오래된 → 최신)이므로 순회하며 `Map<opId, MockTarget>`에 덮어쓰면
  자연히 최신 우선이 된다.
- `error`가 있는 녹화(포워딩 실패, 본문 없음)는 변환하지 않고 `failed`로 센다.
- 기존 단건 저장(`App.sendRecordingToMock`)도 `applyMockTargets(cfg, [target])`를
  쓰도록 정리해 적용 로직을 한 곳으로 모은다.

### App — `sendAllRecordingsToMock(records): string`

단건과 동일 패턴: `loadMockConfig` 1회 → `applyMockTargets` → `saveMockConfig` 1회.
메시지 예: `Mock 저장 12건, 스펙에 없는 경로 3건 제외, 실패 녹화 1건 제외`
(0인 항목은 생략). targets가 0이면 저장하지 않고 사유만 반환.

### UI — `ProxyModal`

- props 추가: `onSendAllToMock: (records: ProxyRecord[]) => string`
- 녹화 목록 상단(목록이 1건 이상일 때)에 **"전체 Mock으로"** 버튼 → 결과를 기존
  `sendMsg`로 표시.

## B. 컬렉션 저장 요청 수정 (인라인 + 라운드트립)

### B-1. 인라인 편집 — `CollectionsModal`

- 행에 ✏️(편집) 버튼 추가. 클릭 시 그 행이 편집 폼으로 전환:
  **이름 input / 메서드 `Select`(GET·POST·PUT·PATCH·DELETE·HEAD·OPTIONS) / URL input**
  + 저장/취소 버튼.
- 내부 상태: `editingId: string | null` + `draft { name, method, url }`.
- 저장 시 해당 `SavedRequest`의 세 필드만 교체(`headers`·`body`·`folder`는 보존).
  URL이 비어 있으면 저장 버튼 비활성. 한 번에 한 행만 편집.
- 헤더·바디 편집은 인라인에 넣지 않는다(폼 비대 방지) — 라운드트립이 담당.

### B-2. 라운드트립 덮어쓰기 — App + `CollectionsModal`

- 저장 요청을 "불러오기" 하면 ad-hoc operation id가 `saved:<id>`다(`savedToRequest`).
  App은 새 상태 없이 **`selected.id`에서 파생**: `loadedSavedId =
  selected?.id.startsWith("saved:") ? selected.id.slice("saved:".length) : null`.
- `CollectionsModal` props 추가: `loadedSavedId?: string | null`.
- `loadedSavedId`가 현재 컬렉션들 안에 존재하고 `current`가 있으면, 저장 패널에
  **"불러온 요청에 덮어쓰기"** 버튼 표시. 동작: 그 `SavedRequest`의
  `method/url/headers/body`를 `current` 값으로 교체. 이름은 `saveName`이 입력돼
  있으면 그걸로, 아니면 기존 이름 유지. `id`/`folder` 보존.
- 다른 operation을 선택하면 `selected.id`가 바뀌어 버튼이 자연히 사라진다(상태 누수 없음).

## C. baseURL 프로젝트별 저장/복원

### 저장 — App (envs와 동일 패턴)

```ts
useEffect(() => {
  if (activeSpecUrl && baseURL) saveJSON(`swaggerman.baseURL.${activeSpecUrl}`, baseURL);
}, [baseURL, activeSpecUrl]);
```

- `loadSpec` 공용 적용부에서 `setBaseURL`·`setActiveSpecUrl`이 같은 배치로 갱신되므로
  옛 키에 잘못 저장되는 경합은 없다(React 18 자동 배칭).
- 빈 값은 저장하지 않는다(입력을 비워도 마지막 비어 있지 않은 저장값이 유지된다 —
  스펙 계산값으로 돌아가려면 ↺ 리셋 버튼 사용).

### 복원 — `loadSpec` 공용 적용부

```ts
const derived = isFileProject(targetUrl)
  ? pickFileBaseURL(parsed.servers)
  : deriveBaseURL(targetUrl, parsed.servers);
setBaseURL(loadJSON(`swaggerman.baseURL.${targetUrl}`, "") || derived);
```

### 리셋 — config-bar의 baseURL 입력 옆 ↺ 버튼

- title "스펙 기본값으로 복원". 클릭 시 저장 키 삭제 + 현재 스펙으로 계산한 `derived`
  적용. 스펙의 서버 주소가 바뀌었을 때 빠져나갈 길이다(항상 저장하는 정책의 보완).
- `removeProject(url)`의 per-URL 키 정리 목록에 `swaggerman.baseURL.<url>` 추가.

## D. 프록시 개선 (Okta 대응)

### D-1. 네트워크 설정 적용 — `proxy_server.rs` + `proxy-client.ts`

```rust
#[tauri::command]
pub async fn proxy_start(
    target_base_url: String, port: u16,
    insecure: Option<bool>, proxy: Option<String>, timeout_ms: Option<u64>,
) -> Result<u16, String>

fn build_forward_client(insecure: bool, proxy: Option<&str>, timeout_ms: u64)
    -> Result<reqwest::Client, String>
// builder: redirect(Policy::none()) + danger_accept_invalid_certs(insecure)
//        + timeout(timeout_ms) + Proxy::all(proxy)(비어 있으면 생략)
```

- 프런트: `startProxy(target, port, net?: Partial<NetworkSettings>)`로 확장.
  App이 `netSettings`를 `ProxyModal`에 prop으로 내려주고 시작 시 전달.
  (`http_request` 커맨드와 같은 값: `insecure`/`proxy`/`timeoutMs`.)
- 새 인자는 모두 Option — 기존 호출/테스트와 하위 호환.

### D-2. 응답 헤더 패스스루 + 리다이렉트/쿠키/CORS

**요청 쪽** (forward 시 제외 헤더): `host`(기존) + **`accept-encoding` 추가** —
본문을 `text()`로 다루므로 압축 응답이 오면 손상된다. 제거하면 업스트림이 평문으로 응답.

**응답 쪽**: Content-Type만 보존하던 것을 → 업스트림 헤더 전체를 전달하되 다음만 제외:

- hop-by-hop: `connection, keep-alive, proxy-authenticate, proxy-authorization, te,
  trailers, transfer-encoding, upgrade`
- `content-length`(axum 재계산), `content-encoding`(본문을 평문으로 받음)
- CORS 계열(`access-control-*`): 프록시가 자체 계산(아래)

**Set-Cookie 재작성** (`rewrite_set_cookie(value) -> String`, 다중 값은 `get_all` 순회):
- `Domain=...` 속성 제거 — localhost 응답에 타깃 도메인 쿠키는 브라우저가 거부
- `Secure` 플래그 제거 — `http://localhost`에서도 쿠키가 붙도록
- `SameSite=None`이면 SameSite 속성 제거 — None은 Secure 필수라 위와 충돌

**Location 재작성** (`rewrite_location(value, target_base, bound_port) -> String`):
- 값이 `target_base`(끝 슬래시 정리)로 시작하면 접두사를 `http://localhost:{bound_port}`로
  교체 — 타깃 내부 리다이렉트가 프록시를 벗어나지 않게.
- 상대 경로·다른 호스트(예: Okta 도메인)는 그대로 전달(클라이언트가 직접 이동).
- `ProxyState`에 `bound_port` 추가(리스너 바인드 후 state 구성으로 순서 조정).

**리다이렉트**: `Policy::none()` — 3xx를 그대로 클라이언트에 반환(녹화에도 3xx가 남는다).

**CORS**: 요청에 `Origin` 헤더가 있으면 `Access-Control-Allow-Origin: <그 Origin>` +
`Access-Control-Allow-Credentials: true` + `Vary: Origin`, 없으면 기존처럼 `*`.
OPTIONS preflight는 `Access-Control-Request-Headers/Method`를 echo(없으면 `*`).

## 테스트 (TDD, 기존 패턴)

- `proxy-to-mock.test.ts`: `recordingsToMocks` 최신 우선 중복 제거 / unmatched·failed
  카운트 / `applyMockTargets`가 enabled·source·dataset·body를 올바르게 설정.
- `ProxyModal.test.tsx`: 녹화 있을 때 "전체 Mock으로" 렌더, 클릭 시
  `onSendAllToMock` 호출 + 결과 메시지 표시.
- `CollectionsModal.test.tsx`: ✏️ → 인라인 폼 전환, 수정 저장 시 `onChange`에 반영
  (headers/body 보존), URL 비면 저장 비활성 / `loadedSavedId` 있으면 "덮어쓰기" 버튼
  렌더, 클릭 시 해당 요청의 method·url·headers·body 교체 + 이름 보존.
- C(baseURL)는 자동 테스트 제외: 적용부가 `saved || derived` 한 줄이라 App 통합
  테스트 비용 대비 가치가 낮다. 수동 검증 2건으로 확정 — ① https로 바꾸고 리로드해도
  유지 ② ↺ 리셋 시 스펙 계산값 복원.
- Rust(`proxy_server.rs`): ① Set-Cookie 2개가 모두 전달되고 Domain/Secure 제거
  ② Location이 타깃 접두사일 때 localhost로 재작성, 외부 호스트는 그대로
  ③ 302가 추적되지 않고 그대로 반환 ④ Origin 요청 시 echo + credentials 헤더
  ⑤ `rewrite_set_cookie`/`rewrite_location` 단위 테스트.

## 구현 순서 제안

C(가장 작고 독립) → A → B → D(Rust 포함, 가장 큼). 각 단계 독립 배포 가능.

## 범위 밖 (YAGNI)

- 완전한 Okta SSO 통과(Okta 앱에 localhost 콜백 등록 필요 — 사용자 환경 설정 영역)
- 시스템(포워드) 프록시 모드·HTTPS MITM(인증서 발급) — 리버스 프록시 구조 유지
- 프록시 모달 재오픈 시 실행 상태 동기화(현재 모달을 다시 열면 "중지됨"으로 보이는
  별건 버그 — 다음 기회)
- 컬렉션 baseURL 일괄 치환(인라인 URL 편집으로 갈음, 필요해지면 추가)
- 바이너리/비-UTF8 응답 본문 보존(기존 제약 유지)
