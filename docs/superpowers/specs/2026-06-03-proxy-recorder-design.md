# 프록시 녹화 모드 설계

날짜: 2026-06-03
대상 버전: v0.4.2

## 배경

- 실서버 응답을 mock으로 만들려면 일일이 복사하기 번거롭다.
- 프록시로 실서버 앞에 서서 트래픽을 흘려보내며 자동 녹화하면, 프론트 앱을 그냥 쓰기만 해도 실제 응답이 mock 후보로 쌓인다.

## 목표

1. 로컬 프록시 서버(기본 9091)가 타깃 Base URL로 모든 요청을 투명 포워딩하면서 요청/응답을 녹화.
2. 녹화 목록을 실시간으로 보고, 항목을 골라 **"Mock으로 보내기"** → 경로 매칭 operation의 Mock 데이터셋으로 저장.
3. Mock 서버의 Rust(axum/reqwest/전역 핸들) 인프라 재활용.

## 비목표 (YAGNI)

- HTTPS 프록시/인증서 가로채기 없음 — 평문 HTTP 포워딩만.
- 요청 변조/필터/리라이트 없음 — 투명 포워딩.
- 녹화 영속화 없음 — 세션 메모리(최근 100개). "Mock으로 보낸" 것만 mock-config에 영속.
- 자동 녹화→Mock 동기화 없음 — 수동 변환(사용자 선택).

## 아키텍처

```
프론트 앱/curl → localhost:9091 (프록시)
                      │ reqwest 포워딩(메서드/헤더/바디/쿼리)
                      ▼
                  타깃 Base URL (실서버)
                      │ 응답
                      ▼
프록시: 응답을 클라이언트에 그대로 반환 + 녹화 버퍼 적재
                      │
                      ▼ (UI에서 "Mock으로 보내기")
            경로 매칭 operation → mock-config 데이터셋 주입
```

## Rust (src-tauri/src/proxy_server.rs, 신규)

- axum fallback 핸들러: 모든 요청을 받아 `{target}{path}{?query}`로 reqwest 포워딩.
  - 메서드/요청 헤더(host 제외)/바디 전달. 응답 상태/헤더/바디를 클라이언트에 반환.
  - 응답에 CORS 허용 헤더 부착(브라우저 클라이언트 대비), OPTIONS preflight 204.
  - 포워딩 실패 시 502 + 녹화에 error 기록.
- 녹화 버퍼: `Mutex<Vec<ProxyRecord>>` 최근 100개.
  ```rust
  struct ProxyRecord { at_ms: u64, method, path, status: u16, response_body: String, error: Option<String> }
  ```
- command:
  - `proxy_start(target_base_url: String, port: u16) -> Result<u16, String>` — 바인딩(포트 충돌 시 "PORT_IN_USE: ..."), 기존 프록시 중지 후 시작
  - `proxy_stop() -> Result<(), String>`
  - `proxy_recordings() -> Vec<ProxyRecord>` (serde camelCase: atMs/method/path/status/responseBody/error)
- 전역 핸들 `OnceLock<Mutex<Option<RunningProxy>>>` + graceful shutdown(oneshot). mock_server와 동일 패턴.
- 앱 종료 시(lib.rs RunEvent::Exit) `proxy_stop_internal()` 호출 추가.

## TS

| 파일 | 책임 |
|---|---|
| `core/proxy-client.ts` (신규) | ProxyRecord 타입, startProxy/stopProxy/getRecordings invoke 래퍼 |
| `core/proxy-to-mock.ts` (신규) | `recordingToMockTarget(record, spec)`: 녹화 method+path → 매칭 operation 찾기(path param 정규화 `/{x}/`). 매칭 opId + 파싱된 응답(배열이면 dataset, 객체면 body) 반환 |
| `core/proxy-to-mock.test.ts` (신규) | 매칭·변환 테스트 |
| `components/ProxyModal.tsx` (신규) | 타깃 URL·포트 입력, 시작/중지, 1초 폴링 녹화 리스트, 항목별 "Mock으로 보내기" |
| `components/ProxyModal.test.tsx` (신규) | UI 테스트 |
| `App.tsx` (수정) | 상단바 "프록시" 버튼 + 모달 + sendRecordingToMock 콜백(mock-config 갱신) |
| `App.css`, `public/tauri-mock.js` (수정) | 스타일 + 브라우저 모드 no-op |

### proxy-to-mock 매칭

- 녹화 path(`/pet/3`)를 spec의 operation path(`/pet/{petId}`)와 매칭: 템플릿의 `{...}`를 와일드카드로 보고 세그먼트 비교(mock_server의 match_path와 동일 개념의 TS 버전).
- method도 일치해야 함. 매칭 operation의 mock-config에 `source: "manual"`로 dataset(응답이 JSON 배열) 또는 body(객체)를 저장.
- 매칭 실패 시 null → UI가 "스펙에 없는 경로" 안내.

## 데이터 흐름

1. 프록시 모달: 타깃 Base URL(기본 현재 baseURL)·포트 입력 → "시작" → `startProxy` → 포트 표시
2. 프론트/curl이 `localhost:9091` 호출 → Rust 포워딩 + 녹화
3. 모달이 1초 폴링(`getRecordings`)으로 녹화 리스트 갱신
4. 항목 "Mock으로 보내기" → `recordingToMockTarget(record, spec)` → 매칭되면 mock-config 갱신(loadMockConfig/saveMockConfig) + "저장됨" 표시, 안되면 안내
5. 중지 → `stopProxy`

## 에러 처리

- 타깃 연결 실패 → 프록시 502 + 녹화 error 필드
- 포트 충돌 → "PORT_IN_USE" → 다른 포트 제안
- 타깃 URL 비어있음 → 시작 버튼 비활성
- 매칭 operation 없음 → "스펙에 없는 경로입니다" 인라인
- 브라우저 모드 → proxy_start/stop/recordings no-op

## 테스트

- Rust `proxy_server.rs`:
  - 포워딩 URL 구성(target + path + query) 순수 함수 테스트
  - 녹화 버퍼 100개 cap
  - 통합: 프록시 시작 → 로컬 테스트 서버로 포워딩 → 응답 반환 + 녹화 확인 → 중지
- `core/proxy-to-mock.test.ts`: path 매칭(정확/param/불일치), method 일치, 응답 배열→dataset/객체→body
- `components/ProxyModal.test.tsx` (jsdom): 시작/중지, 녹화 리스트 렌더, Mock으로 보내기 콜백(매칭/미매칭)
- 브라우저 모드 스모크

## 릴리스

v0.4.2 (1차 로드맵 나머지 묶음의 첫 기능). 나머지(성능 추이·가이드 문서·시간여행·플로우 빌더) 완료 후 함께/순차 배포는 사용자 조율.
