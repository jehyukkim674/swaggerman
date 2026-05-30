# Changelog — SwaggerMan Desktop

크로스플랫폼(Windows·macOS·Linux) OpenAPI 탐색기. Tauri 2 + React + TypeScript.

릴리스 빌드(설치본)는 `desktop-v*` 태그 푸시 시 GitHub Actions가 생성하며,
**Releases** 페이지에서 OS별 설치본을 내려받을 수 있습니다.

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
