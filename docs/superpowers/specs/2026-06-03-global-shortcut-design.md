# 메뉴바 퀵 호출 (전역 단축키) 설계

날짜: 2026-06-03
대상 버전: v0.4.1

## 배경

- 다른 작업 중에 빠르게 특정 API를 호출하고 싶을 때, 앱을 찾아 전환하는 과정이 번거롭다.
- OS 전역 단축키로 어느 앱에서든 SwaggerMan을 즉시 불러내 커맨드 팔레트로 원하는 API에 점프하면 빠르다.

## 목표

1. 사용자 지정 **OS 전역 단축키**(기본 `CmdOrCtrl+Shift+P`)를 어느 앱에서든 누르면 SwaggerMan 창을 앞으로 + 포커스 + 커맨드 팔레트 자동 오픈.
2. 설정 모달에서 단축키를 키 조합 캡처로 커스터마이즈(비우면 비활성).
3. 등록 실패(충돌) 시 사용자에게 안내.

## 비목표 (YAGNI)

- 트레이/메뉴바 아이콘 없음 — "메뉴바 퀵 호출"은 전역 단축키로 해석.
- 단축키 여러 개 없음 — "앞으로 가져오기 + 팔레트" 한 개.
- 단축키로 특정 API 직접 실행 없음 — 항상 커맨드 팔레트 경유(기존 ⌘K 재활용).
- 별도 Spotlight 창 없음 — 메인 창을 앞으로 가져오는 방식.

## 아키텍처

```
어느 앱에서든 단축키 누름
        │ (OS 전역)
        ▼
Rust: tauri-plugin-global-shortcut 핸들러
  · 메인 창 show() + set_focus()
  · 프론트로 "quick-launch" 이벤트 emit
        │
        ▼
App.tsx: quick-launch 리스너 → setPaletteOpen(true)
        │
        ▼
기존 CommandPalette(⌘K) 오픈 → API/저장요청 검색·점프
```

## Rust (src-tauri)

- 의존성: `tauri-plugin-global-shortcut = "2"` ([dependencies], 데스크톱 전용 타깃에 둘 필요는 없음 — 데스크톱 빌드만 대상이므로 일반 dependencies)
- 플러그인 등록: `lib.rs`의 `builder`에 `.plugin(tauri_plugin_global_shortcut::Builder::new().build())` (데스크톱 cfg)
- capability `default.json`에 `"global-shortcut:default"` 추가
- command:
  - `register_global_shortcut(app, accelerator: String) -> Result<(), String>`:
    - 기존 등록이 있으면 모두 해제(unregister_all)
    - accelerator 파싱·등록. 실패 시 `Err("등록 실패: ...")`
    - 단축키 트리거 시: 메인 창(label "main" 우선, 없으면 첫 창) `show()` + `set_focus()`, 프론트로 `app.emit("quick-launch", ())`
  - `unregister_global_shortcut(app) -> Result<(), String>`: 모두 해제
- 앱 종료 시(RunEvent::Exit) 별도 해제 불필요(플러그인이 정리) — 단, mock 서버 정리 훅과 공존 확인

주의: 트리거 핸들러는 `ShortcutState::Pressed`에서만 동작하게(누를 때 1회, 뗄 때 중복 방지).

## TS (core + components)

| 파일 | 책임 | 의존 |
|---|---|---|
| `core/global-shortcut.ts` (신규) | accelerator 영속화(`swaggerman.globalShortcut`, loadJSON/saveJSON), invoke 래퍼 registerShortcut/unregisterShortcut, 키 이벤트→accelerator 변환(eventToAccelerator), accelerator→표시문자열(acceleratorToDisplay) | storage.ts, @tauri-apps/api/core |
| `core/global-shortcut.test.ts` (신규) | 변환·영속화 테스트 | — |
| `components/ShortcutInput.tsx` (신규) | 키 조합 캡처 입력란 + 지우기 버튼 | global-shortcut.ts |
| `components/ShortcutInput.test.tsx` (신규) | 키 캡처·지우기 | — |
| `components/SettingsModal.tsx` (수정) | "전역 단축키" 섹션 추가(ShortcutInput + 등록 상태/에러) | ShortcutInput |
| `App.tsx` (수정) | 시작 시 등록, quick-launch 리스너→팔레트 오픈, 단축키 변경 시 재등록 | global-shortcut.ts, listen |

### accelerator 형식

- 내부 저장/Rust 전달 형식: Tauri accelerator 문자열 — `CmdOrCtrl+Shift+P`, `Alt+F1` 등. modifier는 `CmdOrCtrl`/`Shift`/`Alt`/`Super`, 키는 대문자 1글자 또는 `F1`~`F12` 등.
- `eventToAccelerator(e: KeyboardEvent)`: 눌린 modifier들(metaKey/ctrlKey→CmdOrCtrl, shiftKey→Shift, altKey→Alt) + 주 키(e.key 대문자, 단일 문자나 F키만 유효). modifier 없이 단일 키만이면 무효(null) — 일반 타이핑 가로채기 방지.
- `acceleratorToDisplay(acc)`: `CmdOrCtrl+Shift+P` → 플랫폼별 표시(`⌘⇧P` mac / `Ctrl+Shift+P` 그 외). 간단히 mac이면 기호로.

### ShortcutInput 동작

- 입력란 포커스 → "키 조합을 누르세요" 표시 → keydown 캡처 → eventToAccelerator로 유효하면 표시 + onChange(accelerator)
- 지우기 버튼 → onChange("") (비활성화)
- modifier 없는 단일 키 → 무시(계속 캡처 대기)

## 데이터 흐름

1. 앱 마운트 useEffect: `loadShortcut()` → accelerator 있으면 `registerShortcut(acc)` + `listen("quick-launch", () => setPaletteOpen(true))`
2. 설정에서 ShortcutInput 변경 → `saveShortcut(acc)` → `registerShortcut(acc)`(빈 값이면 unregister), 결과(성공/실패) 상태 표시
3. 전역 단축키 누름 → Rust가 창 show/focus + quick-launch emit → 리스너가 팔레트 오픈
4. 브라우저 모드: register/unregister invoke는 tauri-mock에서 no-op, listen도 no-op

## 에러 처리

- 등록 실패(충돌/잘못된 형식) → 설정에 "이 단축키는 등록할 수 없습니다 (다른 앱과 충돌하거나 잘못된 조합)" 인라인 에러
- 브라우저 모드 → register/unregister/listen no-op, 설정에 "데스크톱 앱에서만 동작" 안내
- 빈 accelerator → unregister만(에러 아님)
- listen 핸들 cleanup: useEffect 반환에서 unlisten

## 테스트

- `core/global-shortcut.test.ts`:
  - eventToAccelerator: ⌘⇧P 이벤트({metaKey,shiftKey,key:"p"})→"CmdOrCtrl+Shift+P", Ctrl+Alt+F1→"CmdOrCtrl+Alt+F1", modifier 없는 단일키→null, modifier만(키 없음)→null
  - acceleratorToDisplay: "CmdOrCtrl+Shift+P"→표시문자열(기호 포함)
  - loadShortcut/saveShortcut 라운드트립(전역 키)
- `components/ShortcutInput.test.tsx` (jsdom):
  - 포커스 후 ⌘⇧P keydown → onChange("CmdOrCtrl+Shift+P") + 표시
  - modifier 없는 단일키 → onChange 미호출
  - 지우기 → onChange("")
- Rust: 단축키 등록은 OS 의존이라 단위 테스트 제한적 — accelerator 빈 문자열/명백히 잘못된 입력에 Err 반환하는 정도만(가능하면). 핸들러 로직은 통합/수동 테스트.
- 브라우저 모드 스모크 + (가능하면) 실제 앱에서 단축키 동작 확인(설치본/dev 앱)

## 릴리스

v0.4.1 묶음(메모/공유/권한매트릭스/메뉴바)의 마지막. 4개 완료 후 v0.4.1로 버전 범프 + CHANGELOG + 배포(사용자 결정). Mock 서버(v0.4.0 draft)와의 배포 순서는 사용자와 조율.
