# Swagger Man Desktop (크로스플랫폼)

[![커피 사주기](https://img.shields.io/badge/☕_커피_사주기-카카오페이-FFCD00?style=for-the-badge)](https://qr.kakaopay.com/FcUzxPAhE)

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

## 구현 현황

- [x] OpenAPI spec URL 로드 (JSON/YAML, 로컬 $ref)
- [x] 태그별 엔드포인트 목록 + 검색
- [x] 요청 편집(path/query/header/body) 및 전송(임의 호스트, CORS 우회)
- [x] 응답 표시(상태/시간/크기/헤더/본문) + Body 복사
- [ ] 히스토리·즐겨찾기·환경/인증·미니맵·코드 스니펫 (macOS 앱 기능 — 추후 포팅)

## 로드맵(관리)

1. SQLite(`tauri-plugin-sql`)로 프로젝트/환경/히스토리/즐겨찾기 영속화
2. 인증(Bearer/Basic/API Key) + spec 디스커버리(`/v3/api-docs/swagger-config` 등)
3. 미니맵·검색 등 응답 뷰어 고도화
4. 자동 업데이트(`tauri-plugin-updater`)
