# Swagger Man Desktop (크로스플랫폼)

[![커피 사주기](https://img.shields.io/badge/☕_커피_사주기-카카오페이-FFCD00?style=for-the-badge)](https://qr.kakaopay.com/FcUzxPAhE)

> 후원 링크는 **모바일 전용**입니다. PC에서는 휴대폰 카메라로 아래 QR을 스캔하세요.
>
> <img src="../../docs/donation-qr.png" width="140" alt="카카오페이 송금 QR">

macOS·Windows·Linux용 OpenAPI/Swagger 탐색기. **Tauri 2 + React + TypeScript**.

기존 macOS 네이티브 앱(`/SwaggerMan`, SwiftUI)과 **별도 코드베이스**이며, 도메인 로직(파서·HTTP·cURL)을 TypeScript로 포팅했습니다. Swift 코드는 건드리지 않습니다.

## 구조

```
apps/desktop/
├─ src/
│  ├─ core/              # 플랫폼 독립 로직 (UI 없음)
│  │  ├─ types.ts            # 도메인 타입
│  │  ├─ openapi-parser.ts   # OpenAPI 3.x/Swagger2 → ParsedSpec ($ref 해석)
│  │  ├─ http-client.ts      # Tauri HTTP 플러그인(CORS 우회) 요청 + spec fetch
│  │  ├─ curl-builder.ts     # cURL 명령 생성
│  │  └─ request-builder.ts  # path/query/header 조립
│  ├─ components/        # Sidebar / RequestEditor / ResponseView
│  ├─ App.tsx            # 3-pane 오케스트레이션
│  └─ App.css            # 다크 테마
└─ src-tauri/            # Rust 셸 (HTTP 플러그인 등록, 권한)
```

## 개발

필수: **Node 20+**, **Rust(stable)**. (macOS는 Xcode CLT, Windows는 MSVC 빌드도구, Linux는 webkit2gtk 등)

```bash
cd apps/desktop
npm install
npm run tauri dev      # 개발 실행(핫리로드)
```

## 빌드

```bash
npm run build          # 프론트엔드 타입체크 + 번들
npm run tauri build    # 현재 OS용 설치본 생성 (.dmg / .msi 등)
```

산출물: `src-tauri/target/release/bundle/`

## 배포 / 릴리스

- `desktop-v*` 태그를 푸시하면 GitHub Actions(`.github/workflows/desktop-release.yml`)가
  **macOS(universal) + Windows** 설치본을 빌드해 Release 초안에 첨부합니다.
- 코드 서명: macOS는 Developer ID + 공증, Windows는 코드서명 인증서가 필요합니다.
  워크플로의 주석 처리된 `APPLE_*` / Windows secret을 채우면 자동 서명됩니다.

## 구현 현황 (v0.4.0 기준)

- [x] OpenAPI spec URL 로드 (JSON/YAML, $ref 해석, 디스커버리)
- [x] 태그별 엔드포인트 목록 + 검색 + 즐겨찾기 + 커스텀 드롭다운(태그 검색)
- [x] 요청 편집(path/query/header/body, multipart/파일) 및 전송(임의 호스트, CORS 우회)
- [x] 응답 표시(상태/시간/크기/헤더/본문) + JSON 뷰어 + 스키마 검증
- [x] 히스토리 + 비교(diff·미니맵·검색) / 컬렉션(Postman 호환) / 러너
- [x] 환경·변수 치환 `{{}}` / 요청 체이닝(추출) / 어서션
- [x] 인증(Bearer/Basic/API Key/OAuth2) + 전역 헤더 + 쿠키 관리
- [x] cURL 가져오기/내보내기 + 코드 스니펫
- [x] AI 어시스턴트 (Claude CLI — 설명/진단/폼 채우기/채팅)
- [x] **Mock 서버** — 스펙 기반 로컬 가짜 API 서버 (스키마 자동 생성/AI/히스토리 응답)
- [x] 자동 업데이트 / 멀티윈도우 / 커맨드 팔레트(⌘K) / 다크·라이트 테마

## 로드맵

1. **프록시 녹화 모드** — 실서버 트래픽을 흘리며 자동 녹화 → mock 데이터화
2. **API 성능 추이** — 히스토리 기반 응답시간 차트
3. **가이드 문서 생성** — 스펙 + 실제 예시 → Markdown/HTML 내보내기
4. **API 시간여행** — 주기 응답 스냅샷 + 시간축 탐색
5. **플로우 빌더** — 노드 캔버스로 API 시나리오 구성

사용 매뉴얼: https://jehyukkim674.github.io/swaggerman/
