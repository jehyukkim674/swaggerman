# Changelog — SwaggerMan Desktop

크로스플랫폼(Windows·macOS·Linux) OpenAPI 탐색기. Tauri 2 + React + TypeScript.

릴리스 빌드(설치본)는 `SwaggerMan-v*` 태그 푸시 시 GitHub Actions가 생성하며,
**Releases** 페이지에서 OS별 설치본을 내려받을 수 있습니다.

> **macOS 설치 시 "손상되어 열 수 없습니다"가 뜨면** (서명 미인증 앱): 터미널에서
> `xattr -dr com.apple.quarantine /Applications/SwaggerMan.app` 실행 후 다시 여세요.

## v0.3.18

- 기능: **새 창(⌘N)** — 창마다 다른 프로젝트를 동시에 볼 수 있는 멀티윈도우 지원
- 개선: **스펙 로딩 전체 화면 오버레이** — 프로젝트 전환·로딩 중에 스피너와 대상 URL을 표시(멈춘 것처럼 보이던 문제 해소)

## v0.3.17

- 개선: **⌘F(Ctrl+F) 응답 검색** — 단축키로 검색 입력에 바로 포커스
- 개선: **응답 본문 복사 버튼**을 검색바 오른쪽으로 이동(우하단 플로팅 제거)
- 개선: 닫기/지우기 **X 버튼 15곳을 ⓧ(동그라미 X) 아이콘으로 통일**, 상단바 설정(⚙) 아이콘 확대

## v0.3.16

- 성능개선: **대용량 응답 본문(10MB+) 먹통 해결** — 가상 스크롤 도입으로 보이는 줄만 렌더링(10MB·78만 줄 응답도 88ms 처리). 미니맵 버킷 샘플링, 히스토리 512KB 절단 저장, 5MB 초과 시 자동 스키마 검증 생략
- 개선: 대형 응답에서도 **구문 색상·검색·미니맵 항상 동작** (기존 2만 줄 초과 시 평문 표시되던 제한 제거)

## v0.3.15

- 기능: **히스토리 비교** — 히스토리 탭에서 2건 선택 → 요청 파라미터(path/query/header) 키별 차이 + 요청·응답 본문 줄 단위 diff

## v0.3.14

- 개선: 응답 **Body 복사**를 본문 우하단 **복사 아이콘 버튼**으로 이동(상단 정리)
- 개선: 응답 액션·주요 버튼에 **상세 hover 설명(툴팁)** 추가

## v0.3.13

- 기능: **프로젝트 관리 모달**(상단바 ✏️) — 저장된 프로젝트 목록을 한곳에서 **추가·이름/URL 수정·삭제·열기**. (기존 단일 편집을 목록 관리로 확장)

## v0.3.12

- 빌드/배포: Windows 설치본을 **NSIS(.exe) 단일**로 정리(MSI 제외) — 빌드 시간 단축. (.exe 설치본으로 자동업데이트 정상 동작)

## v0.3.11

- 버그수정: **OAuth2 토큰 발급**이 네트워크 설정(SSL 검증 끄기·타임아웃·프록시)을 무시하던 문제 — 자체서명 인증서 서버에서도 토큰 발급 가능
- 문서: 사용 매뉴얼 보강(설치 경고 우회·자체서명 스펙 SSL 설정·프로젝트 편집·claude 설치/경로 지정)

## v0.3.10

- 버그수정(Windows): **AI 실행 때마다 콘솔(cmd) 창이 깜빡이던 문제** 수정 — 자식 프로세스에 CREATE_NO_WINDOW 적용
- (내부) 릴리스 CI 빌드 캐시 최적화 — 빌드 시간 단축

## v0.3.9

- 버그수정: 창이 좁을 때 상단바의 **"업데이트 확인"·"✦ AI" 버튼이 잘려 안 보이던** 문제(상단바 줄바꿈 적용)
- 개선: 업데이트 자동확인이 실패하면 **사유를 표시**(사내망/프록시 환경 진단). 기존엔 조용히 무시됨

## v0.3.8

- 기능: **Windows에서 AI(claude) 지원** — `claude.exe`/`claude.cmd` 자동 탐지(`%USERPROFILE%\.local\bin`, `%APPDATA%\npm`), npm 설치(.cmd)도 실행 가능
- 기능: 설정(⚙)에 **claude 실행파일 경로 직접 지정** 추가 — 자동 탐지가 실패해도 경로만 입력하면 AI 동작(모든 OS)
- Windows claude 설치: PowerShell에서 `irm https://claude.ai/install.ps1 | iex` 실행 후 `claude`로 1회 로그인

## v0.3.7

- 기능: 프로젝트 편집 팝업(✏️) — 프로젝트 이름·스펙 URL 수정, 저장 후 재로딩. 사용자 지정 이름은 재로딩 후에도 유지
- 개선: JSON 구문 색상 — 큰 응답(6,000줄↑)에서 색이 빠지던 문제 완화(임계 20,000줄로 상향), 요청 본문 에디터 동일 적용, AI 제안 Body도 색상 표시

## v0.3.6

- 개선: AI 어시스턴트 패널을 기본으로 열어 둠(이전엔 닫혀 있어 ✦ AI를 눌러야 보였음)
- 버그수정: 스펙 로드에도 "SSL 검증 끄기" 설정 적용 — 사내 CA·자체서명 인증서 서버의 OpenAPI 스펙을 로드할 수 있음(기존엔 요청 실행만 적용돼 로드가 실패)
- 변경: 프로세스명을 `desktop` → `SwaggerMan`으로 변경(작업 관리자/Activity Monitor 표기)

## v0.3.5

- 유지보수: 자동업데이트 검증용 릴리스(공개 미러 레포 자동업데이트 동작 확인)

## v0.3.4

- 배포: 공개 미러 레포(`jehyukkim674/swaggerman`)로 릴리스 + 자동업데이트 엔드포인트 이전. 이제 인앱 자동업데이트가 인증 없이 동작
- (v0.3.3의 claude 탐지 수정 포함)

## v0.3.3

- 버그수정: 설치본(.dmg/.exe)을 Finder/탐색기로 실행하면 셸 PATH를 못 받아 `claude` CLI를 못 찾아 **AI 패널이 동작하지 않던** 문제 수정. `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin` 등 흔한 설치 위치를 탐지 후보에 보강

## v0.3.2

- AI: 폼 채우기 3.5배 가속(약 30초→8.5초). `--json-schema` 강제 모드의 다중 턴 에이전트 루프 제거(1턴), 도구 완전 비활성화, 폼 컨텍스트 경량화
- AI: 제안 적용 시 현재 엔드포인트에 없는 path/query 키가 폼에 들어가던 문제 수정(op 전환·히스토리 복원 후 stale 제안 적용 시 발생)

## v0.3.1

- AI: 응답 기반 진단/설명(응답 패널 ✦버튼 · 커맨드 팔레트)
- AI: 프로젝트별 챗 히스토리 영속화(재시작 후 복원)
- AI: 제안을 cURL 복사 · 환경 변수로 저장
- AI: 제안 잉여키 검증(폼 오염 방지) + 컨텍스트(enum/example/응답 스키마) 보강

## v0.3.0

- **AI 어시스턴트 패널(✦ AI)**: 현재 보고 있는 엔드포인트를 컨텍스트로 로컬 `claude` CLI와 대화(Q&A 스트리밍). 우측 슬라이드 패널, 모델 선택(sonnet/opus/haiku), 세션 연속(새 대화로 리셋)
- **요청 작성 도우미**: `/요청 …`(자연어)으로 요청 폼(path·query·headers·body)을 자동 제안 → 검토 후 **[폼에 적용]**(실행은 사용자가 ⌘Enter로)
- 환경 변수 **값**은 AI에 전달하지 않음(이름만) — 토큰 등 비밀 보호
- claude CLI 자동 탐지(PATH + 알려진 경로). 미설치 시 패널에 안내

## v0.2.5

- Authorize: 적용된 토큰 값 **보기/숨김** 토글
- 변수 자동완성: query·path·header 값에 `{{` 입력 시 환경/체인/동적 변수 제안 드롭다운
- 러너 버튼 항상 활성화(컬렉션 없을 때 안내)

## v0.2.4

- 요청 파라미터 미리 채우기: query·path 값을 스펙의 example/default/enum에서 자동 입력
- 빌드: macOS를 Apple Silicon(arm64) 전용으로 — 빌드 시간 절반(Intel 미지원)

## v0.2.3

스펙 인지 기능 + 생산성 도구.

### 스펙 인지(OpenAPI 활용)
- 응답 스키마 검증: 응답 body를 OpenAPI 응답 스키마와 대조해 불일치 표시
- 요청 사전 검증: 전송 전 필수 path/query/body 누락 경고
- 예제 응답 보기: 스펙의 example 응답을 Docs에 표시

### 생산성
- 컬렉션 러너: 컬렉션 요청 일괄 실행 + 통과/실패 리포트
- 응답 뷰 모드: Pretty / Raw / HTML 프리뷰(sandbox) + 응답 파일 저장
- 커맨드 팔레트(⌘K): 오퍼레이션·저장 요청 빠른 검색·이동
- 라이트/다크 테마 토글

### 품질
- 단위 테스트 105개(schema-validate 9 등), Rust 실서버 통합 테스트 4개

## v0.2.2

Postman/Insomnia 류 기능 대거 추가.

### 빠른 편의
- 동적 변수: `{{$timestamp}}`, `{{$isoTimestamp}}`, `{{$guid}}`/`{{$randomUUID}}`, `{{$randomInt}}`
- cURL 가져오기: 명령 붙여넣기 → ad-hoc 요청 생성
- 키보드 단축키: ⌘/Ctrl+Enter 전송

### Body 타입
- `form-urlencoded` · `multipart/form-data` · **파일 업로드**(dialog로 파일 선택)
- Body 형식 선택(None/JSON/urlencoded/multipart)

### 네트워킹
- 쿠키 jar(요청 간 자동 유지) + 쿠키 조회·전체 삭제
- 전역 설정: 타임아웃, SSL 인증서 검증 무시, 프록시 URL

### 컬렉션
- 컬렉션/폴더로 요청 저장·불러오기(스펙과 무관)
- Import: Postman 컬렉션 v2.1 · SwaggerMan 네이티브 JSON
- Export: 네이티브 JSON으로 내보내기

### 품질
- 단위 테스트 95개(curl·동적변수·body모드·collections 포함), ESLint+타입체크 무결
- reqwest multipart/cookies, reqwest_cookie_store, tauri-plugin-dialog 등 라이브러리 적극 활용

## v0.2.1

안정성 점검 및 수정.

- 업데이트 설치 실패 시 `alert()` 대신 인라인 에러 표시 (WKWebView에서 alert/confirm/prompt는 동작이 불안정 — 크래시/무반응 가능성 제거)
- 코드 전반 크래시·버그 위험 지점 점검(변수 치환/체이닝/OAuth2/업데이터, localStorage 안전 파싱, Rust http 커맨드 패닉 없음 확인)

## v0.2.0

API 클라이언트 사용성 강화 + 자동 업데이트.

### 변수 / 체이닝 / 테스트
- 변수 치환: `{{이름}}` 을 URL·헤더·body·path/query에서 환경 변수로 치환
- 환경(Environment)에 변수 목록 추가/편집
- 요청 체이닝: 응답에서 JSONPath로 값 추출 → 변수에 저장 → 다음 요청에 사용
- 어서션: status·JSONPath 값(=/포함/존재)으로 응답 검증, 통과/실패 표시

### 인증
- Authorize를 모달(Swagger UI 스타일)로 전환 — 스킴별 Authorize/Logout, 일괄 저장
- OAuth2 자동 토큰 발급(client_credentials/password) → 선택 스킴에 토큰 자동 적용

### 배포
- 자동 업데이트(Tauri updater): 시작 시 새 버전 확인 → 인앱 설치/재시작
  - CI 빌드에 `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 시크릿 필요
  - 업데이트 매니페스트(`latest.json`)는 릴리스 자산으로 게시
- 코드 서명 훅: `APPLE_*`(macOS 공증)/Windows 서명 시크릿이 있으면 자동 적용

### 품질
- 단위 테스트 73개(variables 17, oauth2 9 등), ESLint + 타입체크 무결

## v0.1.0

첫 릴리스. macOS 네이티브 앱(SwiftUI)의 핵심 기능을 크로스플랫폼으로 이식.

### 스펙 / 요청
- OpenAPI 3.x · Swagger 2.0 로드 (JSON/YAML, 로컬 `$ref` 해석)
- Swagger UI(`index.html`) 자동 디스커버리 (well-known 경로 + `swagger-config`, 401 후보 회피)
- HTTP 요청은 Rust(reqwest)로 처리 — 웹뷰 CORS/스코프 제약 없이 임의 호스트 호출
- 요청 편집: path/query/header/body, 요청 URL 미리보기(한글 raw 표시)
- body 미리 채우기: 스펙 `example` 우선, 없으면 스키마로 예시 생성
- body 샘플 저장/수정/삭제/선택 (오퍼레이션별)
- 요청 취소, 전송 중 로딩 표시

### 인증 / 환경 / 헤더
- Authorize: 보안 스킴(bearer/basic/apiKey)별 토큰 → 요청 헤더 자동 적용
- 환경(여러 Base URL) 관리 모달 (추가/수정/삭제/적용)
- 전역 헤더(모든 요청 적용) 관리 모달 + 요청 화면 읽기 전용 표시

### 응답
- Docs/Response 탭 (파라미터·요청/응답 스키마 트리)
- 라인 번호 + JSON 구문 색상, 미니맵(뷰포트·검색 매치·클릭 이동)
- 검색(Enter, 매치 내비게이션), Body/cURL/코드 스니펫(curl/JS/Python) 복사

### 탐색 / 영속화
- 사이드바: 검색·메서드·태그 필터, 즐겨찾기(★)
- 히스토리: 요청값+응답 저장, 클릭 복원/replay/삭제, 선택 표기 배너
- 프로젝트(spec URL) 목록 저장·전환, 시작 시 마지막 spec 자동 로드
- 프로젝트별 영속화(즐겨찾기/히스토리/인증/환경/전역헤더/샘플), 전역 줌

### 3-pane / UI
- react-resizable-panels 드래그 리사이즈(크기 저장), 다크 테마
- 모던 select·세그먼트 탭·라인 아이콘

### 품질
- 코어 로직 단위 테스트(vitest) 44개, ESLint(정적 분석) + 타입체크 무결
- GitHub Actions CI(lint/typecheck/test/build/cargo) 및 릴리스 워크플로(mac/win 빌드)
