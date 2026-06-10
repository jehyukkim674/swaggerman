# CDP 브라우저 캡처 설계 (2026-06-10)

## 배경 — 왜 만드는가

프록시 녹화는 단일 타깃 리버스 프록시라서 OAuth(Okta) 인증을 통과하지 못한다.
서비스가 보내는 authorize URL의 `redirect_uri`는 **서비스 백엔드 설정의 실제 호스트**이므로,
로그인이 끝나면 브라우저가 실제 호스트로 이동해 프록시를 영구 우회한다(녹화 0건).
Okta에 `localhost:3000`을 등록해도 어디로 돌아갈지는 서비스가 보낸 `redirect_uri`가
결정하므로 소용없다. `redirect_uri` 바꿔치기는 토큰 교환 불일치로 서비스마다 깨질 수
있어 근본 해결이 아니다.

해결: 브라우저 자체에 붙어 모든 네트워크를 보는 **CDP(Chrome DevTools Protocol) 캡처**.
리다이렉트로 호스트가 몇 번 바뀌어도 같은 브라우저 안이므로 전부 녹화된다.

검토 후 기각한 대안:
- **MITM 프록시(Charles식)**: 브라우저 외 클라이언트도 잡히지만 CA 신뢰 설치 UX(관리자
  권한)·인증서 피닝·구현 규모가 커서 기각.
- **raw 패킷 캡처(pcap)**: root 권한 필요 + HTTPS 본문 암호화로 읽을 수 없어 기각.
- **redirect_uri 재작성**: 위 서술대로 서비스 백엔드 구현에 따라 깨져서 기각.

## 결정 사항

| 항목 | 결정 |
|---|---|
| 브라우저 기동 | 앱이 전용 Chrome 인스턴스를 자동 기동(전용 프로필 → Okta 세션 유지) |
| 캡처 범위 | XHR/Fetch 타입만 (정적 리소스·문서 네비게이션 제외) |
| UI | 기존 ProxyModal에 `프록시 | 브라우저` 모드 전환 추가 |
| 구현 위치 | Rust 백엔드 `browser_capture.rs` (기존 proxy_server 패턴과 대칭) |
| v1 범위 | 첫 page 타깃(탭) 1개만 — 같은 탭 리다이렉트는 커버, SSO 팝업창은 미지원 |

## 아키텍처

```
ProxyModal '브라우저' 모드
  → capture_start(시작 URL)                    [Tauri command]
      1. Chrome 실행 파일 탐지 (mac/Windows 후보 경로)
      2. 빈 디버깅 포트 스캔 (9222부터)
      3. Chrome 기동: --remote-debugging-port=PORT
           --user-data-dir=<앱데이터>/capture-profile
           --no-first-run --no-default-browser-check <시작 URL>
      4. http://127.0.0.1:PORT/json/version 폴링 (최대 10초)
      5. /json/list → 첫 type=="page" 타깃의 webSocketDebuggerUrl
      6. WS 연결(tokio-tungstenite) → Network.enable → 이벤트 수신 태스크

CDP 이벤트 → ProxyRecord 변환
  - Network.requestWillBeSent: type ∈ {XHR, Fetch}만 requestId→{method, path+query} 기억
  - Network.responseReceived: status 기록
  - Network.loadingFinished: Network.getResponseBody 호출 → 본문 확보 → 녹화 push
  - 저장소: 프록시와 동일 구조(최근 100개), 별도 static

프론트 1초 폴링(capture_recordings)
  → 기존 녹화 리스트 UI → 'Mock으로' / '전체 Mock으로' 그대로 재사용
```

### Tauri 커맨드 (4개)

| 커맨드 | 역할 |
|---|---|
| `capture_start(startUrl)` | 위 기동 절차. 실행 중이면 중지 후 재시작. 녹화는 시작 시 초기화 |
| `capture_stop()` | WS 태스크 중단 + Chrome 자식 프로세스 kill. 녹화 보존 |
| `capture_recordings()` | `Vec<ProxyRecord>` 반환 (proxy_server의 타입 재사용) |
| `capture_status()` | 실행 여부 — 사용자가 Chrome 창을 직접 닫으면 자동 중지되므로 UI 재동기화용 |

프록시와 브라우저 캡처는 저장소가 분리되어 **동시 실행 가능**(상호 배제 없음).

### 경로 매칭 보정

프록시 녹화의 path는 타깃 base 기준 상대 경로지만 CDP는 실제 호스트의 절대 경로를 준다.
baseURL에 경로 접두사가 있으면(`https://host/api`) 스펙 매칭이 어긋나므로,
`proxy-to-mock.ts`에 `stripBasePath(path, baseUrl)` 헬퍼를 추가해 Mock 변환 직전에
baseURL의 path 접두사를 떼어낸다. 접두사가 아니면 원본 그대로 둔다.

## UI (ProxyModal 확장)

- 모달 상단 세그먼트 버튼으로 `프록시 | 브라우저` 모드 전환.
- 브라우저 모드: 입력은 "시작 URL" 하나(기본값 `defaultTarget`), 포트 입력 없음.
  시작 → Chrome 창이 뜨고 "녹화 중 — 브라우저에서 사용하세요" 표시. 중지 → Chrome 종료.
- 녹화 리스트·Mock 전송 버튼은 기존 컴포넌트 공유, record 소스만 모드에 따라 다름.
- 브라우저 웹 모드(tauri-mock)에서는 기존 프록시와 동일하게 no-op.

## 에러 처리

| 상황 | 처리 |
|---|---|
| Chrome 미발견 | "Chrome을 찾을 수 없습니다" + 탐색 경로 안내 (mac: Chrome/Chromium/Edge/Brave, Windows: Program Files 후보) |
| 10초 내 CDP 미응답 | 자식 프로세스 kill 후 시작 실패 반환 |
| 사용자가 Chrome 창 닫음 | WS 끊김 감지 → 자동 중지(녹화 보존), UI는 status 폴링으로 반영 |
| getResponseBody 실패 / 비-UTF8 본문 | 본문 빈 문자열로 녹화 자체는 남김 |
| 앱 종료 | 기존 `stop_proxy_internal()` 옆에서 `stop_capture_internal()`로 Chrome 정리 |

## 테스트 전략

Mock 서버 구현 때의 병렬 포트 충돌 교훈을 반영한다.

- **Rust 단위**: CDP 이벤트 JSON 파싱→레코드 변환, XHR/Fetch 필터, Chrome 인자 빌드,
  base64 본문 디코드 — 전부 순수 함수로 분리해 테스트.
- **Rust 통합**: 테스트 내 **가짜 CDP 서버**(axum + WS로 `/json/version`·`/json/list`·
  스크립트된 이벤트 제공)에 붙여 종단 검증. 실제 Chrome은 CI에서 띄우지 않는다.
- **프론트 vitest**: `capture-client` 래퍼(tauri-mock), ProxyModal 모드 전환,
  `stripBasePath` 매칭 케이스.

## 의존성

- Rust: `tokio-tungstenite` 추가 (CDP WebSocket 클라이언트). 프론트 추가 의존성 없음.

## 향후 확장 (v1 제외)

- `Target.setAutoAttach`(flatten 세션)로 모든 탭/팝업 캡처 — SSO 팝업창 구성 대응.
- 전체 요청 녹화 + 타입/호스트 필터 UI.
