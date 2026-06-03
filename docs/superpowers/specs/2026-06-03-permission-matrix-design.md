# 권한 매트릭스 테스트 설계

날짜: 2026-06-03
대상 버전: v0.4.1

## 배경

- 사내 인프라 API는 역할(관리자/일반/게스트)별로 접근 권한이 다르다.
- "일반 사용자가 admin API를 호출하면 안 되는데 되는 거 아냐?" 같은 권한 회귀를 빠르게 잡고 싶다.
- 토큰 여러 개로 같은 API들을 호출해 **상태코드 매트릭스**를 만들면 권한 차이가 한눈에 보인다.

## 목표

1. **페르소나(토큰 묶음)** 여러 개와 **대상 API** 여러 개를 골라, 각 (페르소나 × API) 조합으로 요청 → 상태코드 매트릭스.
2. 상태코드를 색으로 구분(2xx 성공 / 401·403 권한 / 기타 에러)해 권한 차이를 시각화.
3. 기존 요청 실행 인프라(buildRequest/executeRequest) 재활용.

## 비목표 (YAGNI)

- 스펙 보안 스킴 매핑 없음 — 토큰은 `Authorization: Bearer`로 고정.
- 응답 본문 비교/diff 없음 — 상태코드만.
- 자동 권한 위반 판정 없음 — 사람이 표를 보고 판단.
- 비-GET 자동 실행 강제 없음 — 안전을 위해 GET만 기본, 쓰기 요청은 경고 + 수동 체크.

## 데이터 모델

```ts
// core/permission-matrix.ts
export interface Persona {
  id: string;
  name: string;      // "관리자" / "일반" / "게스트"
  token: string;     // Bearer 토큰 값(빈 문자열 = 인증 없음)
}

export interface MatrixCell {
  status: number;    // HTTP 상태코드, 0 = 네트워크 오류
  ok: boolean;       // 2xx 여부
  durationMs: number;
  error?: string;    // 네트워크 오류 메시지
}

// 결과: opId → personaId → MatrixCell
export type MatrixResult = Record<string, Record<string, MatrixCell>>;
```

페르소나 영속화: localStorage 키 `swaggerman.personas.${specUrl}` (프로젝트별, 기존 favorites 패턴).

## 토큰 적용

- 페르소나 token이 비어있지 않으면 요청 헤더에 `Authorization: Bearer <token>` 추가.
  - 단, token이 이미 `bearer ` 접두어로 시작하면(대소문자 무시) 그대로 사용(이중 Bearer 방지).
- token이 비어있으면 인증 헤더 없이 호출(게스트/미인증 케이스).
- 스펙 보안 헤더(computeSecurityHeaders)는 권한 테스트에선 **사용하지 않음** — 페르소나 토큰만 인증 수단.

## 대상 API

- 전체 operation 체크박스 목록. **method === "GET"인 것만 기본 체크**, 비-GET은 미체크 + ⚠️ 표시.
- pathParams가 있는 operation은 스펙 기본값(defaultInputs)으로 채워 호출. 기본값 없으면 빈 값 그대로(서버가 404/400 반환할 수 있음 — 그것도 결과의 일부).
- 쿼리/바디는 스펙 기본값(defaultInputs) 사용.

## 컴포넌트

| 파일 | 책임 | 의존 |
|---|---|---|
| `core/permission-matrix.ts` (신규) | Persona/MatrixCell/MatrixResult 타입, loadPersonas/savePersonas, defaultPersonas, `runMatrix(personas, opIds, runOne)` 오케스트레이션(순차 실행, 진행 콜백), statusKind(status→"success"/"perm"/"error"/"redirect"/"net") | storage.ts |
| `core/permission-matrix.test.ts` (신규) | runMatrix 조합 실행·매핑·에러, statusKind 분류, 영속화 | — |
| `components/PermissionMatrixModal.tsx` (신규) | 페르소나 편집(추가/삭제/이름/토큰) + API 체크박스(GET 기본) + 실행 버튼 + 결과 표 + 비-GET 경고 | permission-matrix.ts, ConfirmDialog |
| `components/PermissionMatrixModal.test.tsx` (신규) | 페르소나 CRUD, API 체크, 실행→runOne 호출·표 렌더, 비-GET 확인 | — |
| `App.tsx` (수정) | 상단바 버튼 + 모달 + `runForPersona(op, token)` 콜백 | PermissionMatrixModal |
| `App.css` (수정) | `.pmatrix-*` 표 스타일 | — |

### 실행 콜백 (App.tsx) — 기존 runSaved 패턴 재활용

```ts
async function runForPersona(op: ParsedOperation, token: string): Promise<MatrixCell> {
  const ins = defaultInputs(op);  // 스펙 기본값으로 path/query/body 채움
  // 페르소나 토큰을 Authorization: Bearer로(이중 Bearer 방지)
  const authHeaders: Record<string, string> = {};
  if (token.trim()) {
    authHeaders["Authorization"] = /^bearer /i.test(token.trim()) ? token.trim() : `Bearer ${token.trim()}`;
  }
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

`buildRequest`/`executeRequest`/`defaultInputs`/`baseURL`/`globalHeaders`/`activeVars`/`netSettings`는 이미 App.tsx에 존재(runSaved에서 동일하게 사용).

## 상태코드 색상 (statusKind)

| 분류 | 상태 | 색 |
|---|---|---|
| success | 2xx | 초록 #3fb950 |
| redirect | 3xx | 회색 var(--muted) |
| perm | 401, 403 | 주황 #d29922 (권한 — 핵심 시각화) |
| error | 그 외 4xx/5xx | 빨강 #f85149 |
| net | 0 (네트워크 오류) | 빨강 #f85149, 셀에 "ERR" |

## 데이터 흐름

1. 모달 열기 → `loadPersonas(specUrl)`; 없으면 `defaultPersonas()`("관리자"/"일반"/"게스트(빈 토큰)") 생성
2. 페르소나 토큰 입력(자동 저장), 대상 API 체크(GET 기본)
3. 비-GET이 체크돼 있으면 "실행" 클릭 시 ConfirmDialog("쓰기 요청 N건이 실제 서버에 전송됩니다. 계속할까요?")
4. 확인 → `runMatrix(personas, checkedOpIds, runForPersona)` 순차 실행, 진행률(완료/전체) 표시
5. 결과 표 렌더: 행=op, 열=persona, 셀=상태코드(색상). 셀 hover 시 소요시간/에러 툴팁

## 에러 처리

- 네트워크 오류 → 셀 "ERR"(빨강) + title에 메시지
- 대상 0개 또는 페르소나 0개 → 실행 버튼 비활성
- 스펙 미로드 → 상단바 버튼 비활성
- 실행 중 재실행 방지(버튼 비활성 + "실행 중…")

## 테스트

- `core/permission-matrix.test.ts`:
  - runMatrix가 모든 (persona × op) 조합에 runOne을 호출하고 결과를 opId→personaId→cell로 매핑
  - runOne이 throw해도 해당 셀만 net 에러로 기록하고 나머지는 계속
  - 진행 콜백이 완료 개수만큼 호출됨
  - statusKind: 200→success, 401/403→perm, 404/500→error, 302→redirect, 0→net
  - loadPersonas/savePersonas 라운드트립, defaultPersonas 3개
- `components/PermissionMatrixModal.test.tsx` (jsdom):
  - 페르소나 추가/삭제/토큰 입력
  - API 체크박스: GET 기본 체크, 비-GET 미체크
  - 실행 → 주입된 runOne mock 호출, 결과 셀 렌더(상태코드 표시)
  - 비-GET 체크 후 실행 → 확인 다이얼로그 표시

## 릴리스

v0.4.1 묶음(메모/공유/권한매트릭스/메뉴바)의 세 번째. 묶음 완료 후 함께 배포. CHANGELOG에 항목 추가.
