# 업데이터 프록시 적용 + {{변수}} 호버 툴팁 (2026-06-01)

## 배경

- 회사망 윈도우 PC(외부 연결에 프록시 필요)에서 "업데이트 확인" 시 `error sending request for url (...latest.json)` 에러 발생. 브라우저는 시스템 프록시를 써서 정상인데, 업데이터만 프록시를 거치지 못함
- 원인: `core/updater.ts`가 `check()`를 옵션 없이 호출 → 앱 설정(설정 → 네트워크)의 프록시/타임아웃이 업데이트 확인에는 적용되지 않음
- 요청 폼에 `{{변수}}`를 입력해도 실제로 어떤 값으로 치환될지, 어디서 온 변수인지 한눈에 알 수 없어 디버깅이 어려움

## 1. 업데이터에 앱 네트워크 설정(프록시/타임아웃) 적용

- `checkUpdateStatus(net?)`가 `UpdaterNetOptions`(`proxy`, `timeoutMs`)를 받아 `check({ proxy, timeout })`로 전달 — 앱 설정의 프록시가 GitHub 릴리스 확인에도 적용됨
- `timeoutMs` 기본값 30초, `proxy`가 비면 `undefined`(직접 연결)
- 네트워크 단계 실패(`error sending request`)는 대부분 사내망/프록시 미설정이므로, 에러 메시지에 "설정(⚙) → 네트워크 → 프록시를 지정한 뒤 다시 시도" 힌트를 덧붙임
- `checkForUpdate(net?)`(시작 시 자동 확인)도 같은 옵션을 전달받아 일관되게 동작

## 2. {{변수}} 호버 툴팁

- `components/VarInput.tsx`의 입력에 포함된 `{{변수}}` 위에 마우스를 올리면 툴팁 표시
  - 출처 구분: 환경 그룹 / 체이닝(추출 규칙) / 동적 변수(`$timestamp` 등)
  - 실제 치환 값 미리보기(`substituteVars`·`dynamicValue` 재사용)
  - 미정의 변수(`unresolvedVars`)는 경고 스타일로 강조
- 동적 변수는 매번 값이 바뀌므로 "동적(예시 값)"임을 명시
- 표시 전용 — 입력/자동완성 로직은 건드리지 않음

## 테스트

- updater: `checkUpdateStatus`가 `check`를 `{ proxy, timeout }`로 호출하는지, 실패 메시지에 프록시 힌트가 붙는지 (Tauri 모듈 mock)
- variables: 출처 판별·치환 값·미정의 경고가 올바른지 (순수 함수 단위 테스트)

## 버전

- v0.3.19
