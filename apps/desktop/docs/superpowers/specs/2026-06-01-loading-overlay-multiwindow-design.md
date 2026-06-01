# 로딩 오버레이 + 새 창(멀티윈도우) (2026-06-01)

## 배경

- 프로젝트 전환 시 스펙 로딩에 수 초가 걸리는데 Load 버튼 텍스트만 바뀌어 멈춘 것처럼 보임
- 여러 프로젝트를 동시에 보려면 인스턴스를 따로 띄워야 하는데(`open -n`), 같은 localStorage를 공유해 데이터가 꼬일 위험이 있음

## 1. 전체 화면 로딩 오버레이

- `loading === true`인 동안 화면 전체를 덮는 반투명 오버레이 표시
  - 회전 스피너 + "프로젝트 로딩 중…" + 로딩 중인 spec URL
  - 오버레이가 입력을 차단(실수 클릭 방지)
- 적용 범위: 프로젝트 전환·Load 버튼·새로고침(↻)·시작 시 자동 로드 등 **모든 스펙 로딩**
- 구현: `components/LoadingOverlay.tsx` (표시 전용 컴포넌트) + App.tsx에서 조건부 렌더
- CSS: `.loading-overlay`(fixed, inset 0, z-index 최상위), `.spinner`(CSS 회전 애니메이션)

## 2. 새 창 (⌘N / 상단바 버튼)

- 상단바 "새 창" 버튼 + ⌘N(Ctrl+N) 단축키 → Tauri WebviewWindow로 새 창 생성
- 창마다 독립된 React 앱 인스턴스 → 서로 다른 프로젝트를 동시에 볼 수 있음
- localStorage는 공유(같은 origin)하지만 프로젝트별 키로 분리돼 있어 안전.
  공유 키(lastSpecUrl 등)는 마지막 저장이 우선 — 허용 가능한 동작
- 구현: `core/window.ts`의 `openNewWindow()` — 고유 label(`main-<ts>`)로 WebviewWindow 생성
- Tauri 권한: `capabilities/default.json`에
  - `core:webview:allow-create-webview-window` 추가
  - `windows: ["main"]` → `["main", "main-*"]` (새 창에도 dialog/updater 등 기존 권한 적용)

## 테스트

- LoadingOverlay: 스피너·문구·URL 렌더링
- openNewWindow: WebviewWindow가 고유 label + 기본 창 옵션으로 생성되는지 (Tauri 모듈 mock)

## 버전

- v0.3.18
