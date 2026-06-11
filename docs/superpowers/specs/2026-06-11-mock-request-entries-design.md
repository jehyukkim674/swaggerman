# Mock 요청 엔트리 설계 (2026-06-11)

## 배경

현재 Mock 서버는 **스펙 operation 단위**(메서드 + 경로 템플릿)로만 매칭한다.
그래서 캡처한 서로 다른 실제 요청이 같은 템플릿이면 하나로 합쳐진다.
예: `/api/v1/common/code/IP_STATUS`와 `/api/v1/common/code/IP_USAGE`는 둘 다
스펙 `GET /api/v1/common/code/{codePId}`로 매칭 → 최신 응답 하나만 남는다.

요청: 실제 요청(메서드+경로+쿼리+헤더) 단위로 Mock 응답을 정의·추가·편집·삭제하고,
캡처 목록에서 불필요한 요청을 빼고 저장하며, Mock 설정을 초기화할 수 있어야 한다.

## 결정 사항 (사용자 확인 완료)

| 항목 | 결정 |
|---|---|
| 매칭 모델 | 스펙 operation과 별개로 **요청 엔트리**(경로 정확일치 + 쿼리/헤더 부분일치) 도입 |
| 헤더 매칭 | 모델·Rust가 지원(부분일치). 캡처는 요청 헤더를 기록하지 않으므로 조건은 수동 추가(Phase 2) |
| 우선순위 | 요청 엔트리를 **스펙 라우트보다 먼저** 매칭, 없으면 기존 동작으로 폴백 |
| 캡처 변환 | "전체 Mock으로" 시 각 녹화를 **별도 요청 엔트리**로(실제 경로+쿼리 보존) |
| 캡처 정리 | 프록시/브라우저 녹화 목록 **행별 삭제(×)** |
| 프리셋 | requests도 스냅샷에 포함 |
| 초기화 | Mock 설정 전체 기본값 복원(요청 엔트리 비우기 + operation 기본 복원) |

## 단계 구분

- **Phase 1 (이번 구현)**: 데이터모델 + Rust 매칭(쿼리/헤더) + 캡처→엔트리 변환 +
  캡처목록 행 삭제 + 프리셋 포함 + 초기화. → 캡처 워크플로가 끝까지 동작.
- **Phase 2 (후속)**: Mock 모달에서 요청 엔트리 **수동 추가/편집 UI**(헤더 조건 추가 포함),
  (선택) 요청 헤더 캡처.

---

## 데이터 모델 (`mock-config.ts`)

```ts
/** 이름 있는 매칭 조건(쿼리/헤더 공용) */
export interface MockMatch { name: string; value: string }

/** 실제 요청 단위 Mock 엔트리 */
export interface MockRequestEntry {
  id: string;
  method: string;                 // GET/POST/...
  path: string;                   // 실제 경로(템플릿 아님) 예: /api/v1/common/code/IP_STATUS
  query?: MockMatch[];            // 쿼리 부분일치(지정한 것만 일치하면 됨)
  headers?: MockMatch[];          // 헤더 부분일치(이름 대소문자 무시)
  status: number;
  body?: unknown;                 // 응답(JSON 또는 원문 문자열)
  delayMs: number;
  note?: string;                  // 라벨(선택)
}

// 추가
export interface MockServerConfig {
  port: number;
  operations: MockOperationConfig[];
  requests?: MockRequestEntry[];   // ← 신규(없으면 빈 배열로 취급)
}
// MockPreset.operations 옆에 requests?: MockRequestEntry[] 도 포함
```

`loadMockConfig`/`defaultMockConfig`는 `requests: []`로 초기화. 저장/로드 시 보존.

## 캡처 → 요청 엔트리 (`proxy-to-mock.ts`)

`recordingToRequestEntry(record): MockRequestEntry`:
- method = record.method
- path = record.path의 경로부(`?` 앞)
- query = record.path의 쿼리스트링을 파싱해 `{name,value}[]`
- status = record.status
- body = JSON.parse(responseBody) 성공 시 그 값, 실패 시 원문 문자열
- delayMs = 0, id = randomUUID

`recordingsToRequestEntries(records)`:
- error 있는 녹화 제외(failed 카운트)
- **같은 (method+path+query) 조합은 최신 녹화가 이김**(중복 제거)
- 반환: `{ entries, failed }` (스펙 매칭 불필요 — 실제 경로 그대로 저장하므로 unmatched 개념 없음)

`saveRecordingsToMock`(기존, async) 수정:
- 기존: 스펙 operation에 applyMockTargets → 프리셋 저장
- 변경: `recordingsToRequestEntries`로 엔트리 생성 → 활성 config의 `requests`에 추가한
  스냅샷을 프리셋으로 저장. saved = entries.length. (operation dataset 변환은 더 이상 안 함)
- persisted/실패 처리·반환 형태는 기존과 동일(`{ saved, unmatched:0, failed, persisted }`)

## Rust mock 서버 (`mock_server.rs`)

`MockRoute` 외에 요청 엔트리 라우트를 추가로 전달받는다(`mock_start` 인자에 `requests` 추가,
또는 `MockServerData`에 필드 추가). 매칭 우선순위:

1. **요청 엔트리 먼저**: 들어온 요청에 대해
   - method 정확일치 AND path 정확일치(둘 다 디코드 후 비교)
   - 엔트리의 query 전부가 요청 쿼리에 같은 값으로 존재(부분일치)
   - 엔트리의 headers 전부가 요청 헤더에 존재(이름 대소문자 무시, 값 일치)
   - **조건 수(query+header)가 많은 엔트리 우선**(더 구체적인 것이 이김), 동률이면 목록 순서
2. 매칭된 엔트리 있으면 status + body(+delay) 응답
3. 없으면 **기존 스펙 라우트(MockRoute) 매칭**으로 폴백(현재 동작 그대로)

순수 함수로 분리: `match_request_entry(entries, method, path, query, headers) -> Option<&Entry>`
(단위 테스트 대상). body 직렬화는 기존 라우트 응답과 동일 방식.

## 프론트 — 캡처 목록 행 삭제 (`ProxyModal.tsx`)

- 프록시/브라우저 녹화 행에 **삭제(×) 버튼** 추가.
- 삭제는 **표시용 로컬 상태에서 제거**(프록시는 폴링으로 다시 채워질 수 있으므로,
  "숨김 id 집합"을 두어 표시에서 제외 — 백엔드 녹화는 건드리지 않음).
  브라우저 모드도 동일. "전체 Mock으로"는 **보이는(숨김 제외) 녹화만** 저장.

## 프론트 — Mock 모달 초기화 (`MockServerModal.tsx`)

- 제어 바에 **"초기화"** 버튼.
- 클릭 → `window.confirm("Mock 설정을 기본값으로 되돌립니다(요청 엔트리·operation 설정 초기화). 계속할까요?")`
  → `setConfig(defaultMockConfig(spec))`(requests 빈 배열 포함). 자동저장이 반영.
- 프리셋은 건드리지 않음(별도 보관).

## 에러 처리

| 상황 | 처리 |
|---|---|
| 녹화 본문이 JSON 아님 | body를 원문 문자열로 저장 |
| 매칭 0건(전부 삭제됨) | "저장할 녹화가 없습니다" |
| 프리셋 저장 실패 | 기존대로 persisted=false → 정직한 에러 |
| 요청 엔트리 path/query 빈 값 | path 필수, query 빈 항목은 무시 |

## 테스트

- **mock-config**: requests 기본값·로드/저장 보존.
- **proxy-to-mock**: `recordingToRequestEntry`(경로/쿼리 파싱·body), `recordingsToRequestEntries`
  (중복 최신 우선·failed), `saveRecordingsToMock`(엔트리로 프리셋 저장·persisted).
- **Rust**: `match_request_entry`(경로 정확일치, 쿼리 부분일치, 헤더 대소문자, 구체성 우선,
  스펙 폴백) 단위 테스트.
- **ProxyModal**: 행 삭제 시 표시 제외 + "전체 Mock으로"가 보이는 것만 전달.
- **MockServerModal**: 초기화 confirm 후 defaultMockConfig 적용.
- **실세계 회귀 테스트** 갱신: IP_STATUS·IP_USAGE가 **각각 별도 엔트리**로 저장되는지.

## 비범위 (Phase 2)

- 요청 엔트리 수동 추가/편집 UI(헤더 조건 입력 포함).
- 요청 헤더 캡처(ProxyRecord 확장).
