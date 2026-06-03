# 요청 공유 설계 (붙여넣기 방식)

날짜: 2026-06-03
대상 버전: v0.4.1

## 배경

- "이 요청 한번 보세요"처럼 동료에게 특정 요청 설정을 전달하고 싶다.
- 이 앱은 서버가 없으므로 자동 동기화는 불가. 요청 설정(작은 JSON)을 **압축 텍스트로 인코딩**해 복사→붙여넣기로 공유한다.
- 토큰/비밀번호 같은 민감정보가 실수로 공유 코드에 박히지 않도록 기본 제외한다.

## 목표

1. 현재 요청을 **공유 코드**(압축 텍스트)로 내보내기 → 복사.
2. 공유 코드를 붙여넣어 **미리보기 후 요청 폼에 적용**(가져오기).
3. 민감 헤더(Authorization/Cookie/token/api-key 등)는 **기본 제외**, 제외 사실을 양쪽에 안내.

## 비목표 (YAGNI)

- 딥링크(`swaggerman://`) 프로토콜 핸들러 없음 — 붙여넣기 방식만 (사용자 결정).
- QR 코드 없음 — 동적 QR 생성기 의존성 도입 안 함 (사용자 결정). 링크 복사/붙여넣기만.
- 파일(.smreq) 내보내기 없음 — 이번 범위는 클립보드 텍스트만 (컬렉션 내보내기가 이미 파일 공유를 커버).
- 중앙 서버/단축 URL 없음.

## 공유 페이로드

```ts
// core/share.ts
export interface ShareableRequest {
  v: 1;                          // 포맷 버전
  method: string;
  url: string;                   // 원본 URL(Base URL + path + query, 변수 치환 전)
  baseURL?: string;              // 선택 포함
  pathParams: Record<string, string>;
  queryParams: ShareParam[];
  headers: ShareParam[];         // 민감 헤더는 인코딩 시 제외됨
  body: string;
  bodyMode?: string;
  note?: { text: string; status: string };  // 연결된 API 메모(선택)
  excludedSecrets?: string[];    // 제외된 민감 헤더 이름 목록(받는 쪽 안내용)
}

export interface ShareParam {
  key: string;
  value: string;
  enabled: boolean;
}
```

공유에 담는 것(사용자 선택): 메서드+URL+파라미터(필수), 일반 헤더(민감 제외), 연결된 메모, Base URL.

## 인코딩

- 인코딩: `JSON.stringify` → UTF-8 bytes → **gzip(CompressionStream "gzip")** → **base64url** → 접두어 `swaggerman:req:` 붙임.
- 디코딩: 접두어 제거 → base64url 디코드 → **gunzip(DecompressionStream "gzip")** → JSON.parse.
- 라이브러리 0개. 브라우저 내장 `CompressionStream`/`DecompressionStream` 사용(Tauri 웹뷰 = 최신 WebKit/WebView2라 지원됨). base64url은 직접 구현(표준 btoa/atob + URL-safe 치환).

## 민감정보 제외 (기본 ON)

헤더 key가 다음 패턴(대소문자 무시)에 매칭되면 제외:
`authorization`, `cookie`, `set-cookie`, 그리고 부분일치 `token`, `api-key`, `apikey`, `secret`, `password`, `passwd`, `auth`(단어 경계 고려 — `authorization` 외에 `x-auth-token` 등도 매칭).

- `encodeShare(req, { includeSecrets })`:
  - `includeSecrets`가 false(기본)면 민감 헤더를 제거하고, 제거된 이름을 `excludedSecrets`에 기록.
  - true면 전부 포함하고 `excludedSecrets`는 비움.
- 모달에 "민감정보 포함" 체크박스(기본 해제). 체크 시 경고 문구 표시.

## 컴포넌트

| 파일 | 책임 | 의존 |
|---|---|---|
| `core/share.ts` (신규) | ShareableRequest 타입, `encodeShare`/`decodeShare`, `isSecretHeader`, gzip+base64url 헬퍼. UI 없는 순수 비동기 모듈(CompressionStream이 async) | 없음 |
| `core/share.test.ts` (신규) | 라운드트립, 민감 제외/포함, 버전 불일치·깨진 코드 에러 | — |
| `components/ShareModal.tsx` (신규) | 탭 2개: **내보내기**(코드 표시·복사·민감 토글) / **가져오기**(붙여넣기→미리보기→적용) | share.ts, Select 불필요 |
| `components/ShareModal.test.tsx` (신규) | 내보내기 코드 생성·복사, 가져오기 미리보기·적용 | — |
| `App.tsx` (수정) | "공유" 버튼(요청 화면 또는 상단바), 모달 상태, 적용 콜백(요청 폼 채우기) | ShareModal |

### 적용(가져오기) 경로
- 디코드된 ShareableRequest를 현재 화면에 반영. 기존 cURL import가 `onImport(operation, inputs, baseURL)`로 폼을 채우는 패턴이 있으나, 공유는 특정 operation에 매이지 않을 수 있다(URL만 있음). 따라서:
  - 현재 선택된 operation이 있으면 그 inputs(pathParams/queryParams/headers/body/bodyMode)를 공유 값으로 덮어쓴다.
  - baseURL이 포함됐고 사용자가 적용하면 baseURL도 갱신(선택).
  - note가 포함됐으면 해당 operation 메모에 적용할지 묻거나 자동 적용(단순화: 자동 적용).
  - operation이 선택 안 된 상태면 "요청을 먼저 선택하세요" 안내(또는 URL 기반으로 매칭되는 operation 자동 선택은 범위 외).

## 데이터 흐름

**내보내기:**
1. 요청 화면에서 "공유" → ShareModal(내보내기 탭)
2. 현재 inputs + (선택)note/baseURL → `encodeShare(req, {includeSecrets:false})` → 코드 표시
3. "복사" → 클립보드. 민감 제외 시 "🔒 민감 헤더 N개 제외됨" 표시

**가져오기:**
1. ShareModal(가져오기 탭) → 코드 붙여넣기
2. `decodeShare(text)` → 미리보기(메서드/URL/헤더 수/제외된 민감 목록/메모)
3. "적용" → 현재 요청 폼에 반영 → 모달 닫기

## 에러 처리

- 잘못된 접두어/깨진 base64/gunzip 실패 → "공유 코드를 읽을 수 없습니다" 인라인 에러
- 버전 불일치(`v !== 1`) → "지원하지 않는 공유 코드 버전입니다"
- CompressionStream 미지원 환경(이론상) → try/catch로 "이 환경에서는 공유를 지원하지 않습니다"
- 가져오기 시 operation 미선택 → 적용 버튼 비활성 + 안내

## 테스트

- `core/share.test.ts`:
  - encode→decode 라운드트립(모든 필드 보존)
  - 민감 헤더 기본 제외 + excludedSecrets 기록, includeSecrets:true면 포함
  - isSecretHeader: authorization/cookie/x-auth-token/api-key/password 매칭, accept/content-type 비매칭
  - decode: 잘못된 접두어/깨진 코드/버전 불일치 → throw
- `components/ShareModal.test.tsx` (jsdom):
  - 내보내기: 현재 요청으로 코드 생성, 복사 버튼 클립보드 호출, 민감 제외 안내 표시
  - 가져오기: 유효 코드 붙여넣기 → 미리보기 표시 → 적용 콜백 호출, 깨진 코드 → 에러
  - CompressionStream은 jsdom에 없을 수 있음 → 테스트 setup에서 폴리필 또는 share.ts를 동기 폴백 경로 제공. (구현 시: jsdom에 CompressionStream 없으면 vitest 환경에 Node의 zlib 기반 폴리필 주입 — test-setup.ts에 추가)

## 릴리스

v0.4.1 묶음(메모/공유/권한매트릭스/메뉴바)의 두 번째. 묶음 완료 후 함께 배포. CHANGELOG에 항목 추가.
