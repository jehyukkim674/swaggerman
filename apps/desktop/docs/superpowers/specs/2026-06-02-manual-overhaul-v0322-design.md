# 사용 매뉴얼 전면 개편: v0.3.22 전체 기능 + 번호 주석 스크린샷 (2026-06-02)

## 배경

- 사용 매뉴얼(gh-pages 브랜치 `index.html`, https://jehyukkim674.github.io/swaggerman/)이 v0.3.11 시점에 멈춰 있음
- 앱은 v0.3.22 — 히스토리 비교, 멀티윈도우(⌘N), 요청 샘플, 마지막 위치 유지, 변수 툴팁 등 11개 릴리스 분량이 미반영
- 인증(Authorize·OAuth2), 히스토리, 컬렉션·러너, 동적 변수, 전역 헤더, 쿠키, 설정 등은 **처음부터 매뉴얼에 없던** 기능
- 기존 스크린샷 5장은 구버전 UI + 사내 CMDB API(localhost) 화면

## 결정 사항

| 항목 | 결정 |
|---|---|
| 범위 | **전체 기능 커버** — 신규 + 미문서화 기능 모두 |
| 구조 | **전면 재구성** — 16개 섹션 목차 |
| 스크린샷 | **전부 새로 촬영** — 창 전체(crop 없음) + 빨간 네모박스·번호 주석, 본문 설명과 번호 1:1 매칭 |
| 데모 데이터 | 공개 Petstore 스펙 + 가짜 값 (사내 정보 노출 금지) |
| 테마 | 다크 테마 (매뉴얼 페이지 디자인·기존 스크린샷과 통일) |
| 촬영 방법 | Accessibility 권한 기반 AppleScript 자동화 + `screencapture -l<창ID>` + PIL 주석 |

## 매뉴얼 구조 (16개 섹션)

1. 소개
2. 설치 — macOS(xattr)·Windows(SmartScreen) 경고 우회 포함 (기존 내용 유지)
3. **화면 구성** ★신규 — overview·상단바 스크린샷 + 영역별 번호 설명
4. 시작하기 — 스펙 로드, 프로젝트 관리 모달, 새 창(⌘N), 마지막 위치 복원, SSL 자체서명 안내
5. 요청 보내기 — 파라미터·Body, URL 미리보기(멀티라인·복사), 요청 샘플, cURL 가져오기, 사전 검증
6. 응답 보기 — Docs/Response 탭, Pretty/Raw/Preview, 검색(⌘F), 미니맵, 복사(cURL·코드), 스키마 검증, 파일 저장, 대용량(10MB+) 성능
7. **인증 (Authorize)** ★신규 — bearer/basic/apiKey, 토큰 보기/숨김, OAuth2 자동 발급
8. 환경과 변수 — 환경 전환, {{변수}}, 동적 변수($timestamp 등), 자동완성, 호버 툴팁, 체이닝, 어서션
9. **히스토리와 비교** ★신규 — 저장/복원/replay, 2건 비교(파라미터 diff + 응답 diff·검색·미니맵)
10. **컬렉션과 러너** ★신규 — 컬렉션/폴더 저장, Postman Import/Export, 일괄 실행 리포트
11. ✦ AI 어시스턴트 — 대화, /요청 폼 채우기, 설명/진단, 히스토리, 보안(변수 값 미전송), claude 설치·경로 (기존 내용 유지·보강)
12. **전역 헤더·쿠키** ★신규
13. **설정** ★신규 — 타임아웃, SSL 검증, 프록시, claude 경로, 테마·줌
14. 자동 업데이트 — 사내망 프록시 환경 안내 포함
15. 단축키 — ⌘K, ⌘Enter, ⌘F, ⌘N, ⌘+/-/0 (Windows는 Ctrl)
16. FAQ — 기존 6개 + 신규(요청 샘플, 비교, 멀티윈도우, 입력값 복원 등)

## 스크린샷 계획 (14장)

모두 **창 전체 캡처**(crop 금지), 빨간 박스 + 번호(①②③…) 주석. 본문에서 번호별로 설명.

| # | 파일 | 화면 상태 | 번호 주석 |
|---|---|---|---|
| 1 | `overview.png` | Petstore 로드 + 응답 표시 | ①상단바 ②사이드바 ③요청 편집기 ④우측 패널 |
| 2 | `topbar.png` | 같은 화면, 상단바에 주석 | ①스펙 URL ②Load ③프로젝트 ④✏️관리 ⑤환경 ⑥Authorize ⑦cURL ⑧컬렉션 ⑨러너 ⑩전역헤더 ⑪⚙설정 ⑫✦AI |
| 3 | `projects.png` | 프로젝트 관리 모달 | ①목록 ②추가 ③수정 ④삭제·열기 |
| 4 | `request.png` | GET 요청 편집 | ①메서드/경로 ②URL 미리보기·복사 ③요청 샘플 ④Query/Path ⑤Headers ⑥Send |
| 5 | `body-sample.png` | POST Body + 샘플 | ①Body 형식 ②JSON 에디터 ③샘플 저장/전환 |
| 6 | `response.png` | 응답 수신 | ①상태·시간 ②Pretty/Raw/Preview ③검색(⌘F) ④미니맵 ⑤복사 ⑥스키마 검증 |
| 7 | `docs.png` | Docs 탭 | ①파라미터 ②요청 스키마 ③응답 스키마 |
| 8 | `authorize.png` | Authorize 모달 | ①스킴 목록 ②토큰 입력·보기/숨김 ③OAuth2 ④Authorize/Logout |
| 9 | `environments.png` | 환경 모달 | ①환경 목록 ②Base URL ③변수 ④추가/적용 |
| 10 | `history.png` | 히스토리 탭 + 2건 선택 | ①목록 ②복원 ③비교 버튼 |
| 11 | `compare.png` | 비교 모달 | ①파라미터 diff ②응답 diff ③검색 ④미니맵 |
| 12 | `collections-runner.png` | 컬렉션 모달(+러너) | ①컬렉션·폴더 ②저장 요청 ③Import/Export ④일괄 실행 — 한 화면에 안 담기면 `collections.png`/`runner.png` 2장으로 분리(총 15장) |
| 13 | `ai-panel.png` | AI 대화 + 제안 카드 | ①모델 선택 ②대화 ③제안 카드 ④폼에 적용 ⑤cURL·변수 저장 |
| 14 | `settings.png` | 설정 모달 | ①타임아웃 ②SSL 검증 ③프록시 ④claude 경로 |

## 데모 데이터 (전부 공개·가짜 값)

- 스펙: `https://petstore3.swagger.io/api/v3/openapi.json` (사내망에서 접근 확인됨)
- 환경: `개발`/`운영` 2개, 변수 `petId=1`, `apiToken=demo-token-1234`
- Authorize: `api_key` 스킴 → `demo-api-key-12345`
- 히스토리: `GET /pet/findByStatus`를 파라미터 바꿔 2회 전송(비교 데모), `GET /store/inventory` 등
- 요청 샘플: 이름 붙인 샘플 1~2개 ("판매중 펫 조회" 등)
- 컬렉션: "Petstore 데모" + 요청 2~3개 → 러너 실행 리포트
- AI 대화: 엔드포인트 설명 질문 + `/요청 판매중인 펫 조회해줘` → 제안 카드

## 촬영 자동화 방법

1. `osascript`(System Events)로 SwaggerMan 활성화 — Accessibility 권한 부여 완료(cmux)
2. **새 창(⌘N)에서만 작업** — 사용자의 기존 창 3개(사내 API 작업 중)는 건드리지 않음
3. 클릭·키 입력은 좌표 기반: 캡처 → 좌표 분석 → 클릭 → 캡처로 검증 (Retina 2배율 좌표 변환 주의)
4. 캡처: `screencapture -x -o -l<창ID>` (다른 Space에 있어도 캡처 가능)
5. 주석: Python PIL로 빨간 박스 + 번호 원 — 좌표는 캡처 분석으로 결정
6. 각 캡처마다 사내 정보(내부 IP·도메인·토큰) 노출 여부 확인 후 사용

## 퍼블리시

- `gh-pages` 브랜치: `index.html` 전면 교체 + `screenshots/` 14장 교체(기존 5장 삭제) → 커밋 → **personal 레포(jehyukkim674/swaggerman) gh-pages 푸시** → Pages 자동 반영
- `main` 브랜치(origin+personal): 설계 문서·구현 계획 + **스크린샷 자동화 스크립트(`apps/desktop/scripts/manual/`)** 커밋 — 다음 매뉴얼 갱신 때 재사용
- 매뉴얼 본문 푸터에 "v0.3.22 기준" 표기 추가 (이후 갱신 시점 추적용)

## 안전장치

- 스크린샷에 사내 데이터 노출 금지 — 데모 창에서 Petstore만 사용, 캡처마다 검수
- 사용자 앱 데이터(프로젝트·히스토리·인증) 변경 금지 — 새 창 + 새 Petstore 프로젝트만 추가
- 작업 후 데모 창 닫기, 임시 캡처 파일 삭제
- 작업 중(30~60분) 사용자가 Mac을 조작하면 클릭이 어긋날 수 있음 — 시작 전 고지

## 완료 기준

- gh-pages 매뉴얼이 v0.3.22 전체 기능을 16개 섹션으로 설명
- 14장 스크린샷 모두 새 촬영본 + 번호 주석, 본문 설명과 번호 일치
- 사내 정보 노출 0건
- GitHub Pages에서 정상 렌더링 확인
