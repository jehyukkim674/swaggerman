# Mock 프리셋 설계 (2026-06-10)

## 배경

Mock 서버 설정은 현재 스펙당 **단일 config**(`swaggerman.mock.${specUrl}`)로만 관리되고
변경 시 자동 저장된다(MockServerModal, 디바운스 400ms). 시나리오별로 다른 Mock 응답
세트를 오가며 쓰려면 매번 수동으로 다시 설정해야 한다.

요청: 현재 Mock 설정을 **이름(제목) 붙여 여러 개 저장**하고, 드롭다운으로 골라
불러올 수 있게 한다. 생성 진입점은 두 곳 — ① Mock 모달의 "현재 설정 저장",
② 프록시 녹화의 "전체 Mock으로"(제목 입력).

## 결정 사항 (사용자 확인 완료)

| 항목 | 결정 |
|---|---|
| 핵심 모델 | 이름 붙인 **Mock 프리셋**(전체 operations 설정 스냅샷)을 여러 개 저장·선택 |
| 저장소 | 스펙별 프리셋 목록 `swaggerman.mock.presets.${specUrl}` (활성 config와 분리) |
| 프록시 전체저장 | 제목 입력 → **새 프리셋으로만 저장**(활성 config는 건드리지 않음) |
| 프리셋 불러오기 | **확인 후** 활성 config 덮어쓰기 |
| 단건 "Mock으로" | 변경 없음(기존대로 활성 config 적용) |

## 데이터 모델 (`mock-config.ts`에 추가)

```ts
/** 이름 붙인 Mock 설정 스냅샷 */
export interface MockPreset {
  id: string;        // crypto.randomUUID()
  title: string;
  savedAt: number;   // Date.now()
  operations: MockOperationConfig[];  // operations만 스냅샷(port 제외)
}
```

- 저장 키: `swaggerman.mock.presets.${specUrl}` → `MockPreset[]`
- port는 프리셋에 넣지 않는다(활성 config의 port 유지). operations만 스냅샷.

### 순수 함수 (CRUD + 머지) — 단위 테스트 대상

```ts
export function loadPresets(specUrl: string): MockPreset[]
export function savePreset(specUrl: string, title: string, operations: MockOperationConfig[]): MockPreset
  // id/savedAt 부여, 목록 맨 앞에 추가(최신 우선), 저장 후 생성된 프리셋 반환
export function deletePreset(specUrl: string, id: string): void
export function renamePreset(specUrl: string, id: string, title: string): void
export function applyPresetToConfig(config: MockServerConfig, preset: MockPreset): MockServerConfig
  // 새 config 반환: port는 config 유지, operations는 preset 값으로 교체하되
  // "현재 config에 존재하는 opId만" 반영(스펙에 없는 프리셋 opId는 무시 — loadMockConfig 패턴과 동일).
  // 현재 config에 있고 프리셋에 없는 opId는 기존 config 값 유지.
```

`applyPresetToConfig` 머지 규칙: 결과 operations는 `config.operations`를 순회하며,
같은 opId가 preset에 있으면 preset의 op 설정으로, 없으면 config의 기존 설정으로.
(순수 함수 — config/preset을 변형하지 않고 새 객체 반환.)

## 프록시 전체저장 → 프리셋 (`App.tsx`)

`sendAllRecordingsToMock(records, title)` — 시그니처에 `title` 추가:

```
1) recordingsToMocks(spec, records, baseURL)로 targets 계산
2) targets 0건이면 "저장할 녹화가 없습니다…" 반환(프리셋 생성 안 함)
3) base = loadMockConfig(specUrl, spec) (현재 활성 config 스냅샷)
4) applyMockTargets(base, targets)  // base.operations에 녹화 반영
5) savePreset(specUrl, title, base.operations)  // 새 프리셋으로만 저장
6) saveMockConfig는 호출하지 않음(활성 config 불변)
7) `프리셋 'title' 저장됨 (N건, 제외 M건…)` 메시지 반환
```

단건 `sendRecordingToMock`은 기존대로 활성 config에 적용(변경 없음).

## UI

### MockServerModal — 프리셋 바 (상단 컨트롤 영역에 한 줄 추가)

- **드롭다운**: 저장된 프리셋 목록(`title · 저장시각`). 선택 시
  `window.confirm("현재 Mock 설정을 이 프리셋으로 덮어씁니다. 계속할까요?")` →
  확인 시 `setConfig(applyPresetToConfig(config, preset))`. (자동저장 useEffect가 반영)
- **"현재 설정 저장"** 버튼 → 인라인 제목 입력(input + 저장/취소). 빈 제목은 저장 비활성.
  저장 시 `savePreset(specUrl, title, config.operations)` → 드롭다운 갱신.
- 선택된 프리셋 옆 **이름변경(✏️)** / **삭제(🗑)**. 삭제는 confirm.
- 프리셋 0개면 드롭다운 대신 "저장된 프리셋 없음" 힌트.
- 프리셋 목록은 컴포넌트 state(`presets`)로 들고, 저장/삭제/이름변경 후 `loadPresets`로 재동기화.

### ProxyModal — 전체저장 제목 입력

- 기존 "전체 Mock으로" 버튼 클릭 시 **인라인 제목 입력 행** 토글(input + 저장/취소).
- 저장 클릭 → `onSendAllToMock(records, title)` 호출 → 결과 메시지 표시. 입력 행 닫기.
- 빈 제목이면 저장 비활성. 프록시/브라우저 두 모드 공통(shownRecords 사용).
- Props 시그니처: `onSendAllToMock: (records: ProxyRecord[], title: string) => string`.

## 에러 처리

| 상황 | 처리 |
|---|---|
| 빈 제목 | 저장 버튼 비활성 |
| 중복 제목 | 허용(다른 id). 드롭다운은 `title · 저장시각`으로 구분 |
| 스펙에 없는 opId가 프리셋에 있음 | `applyPresetToConfig`에서 무시(스펙 변경 안전) |
| 녹화/매칭 0건 | 프리셋 생성 안 함 + 안내 메시지 |
| 프리셋 0개 | 드롭다운 자리에 힌트 |

## 테스트

- **mock-config.test.ts**: `loadPresets`(빈/기존), `savePreset`(id·savedAt·맨앞추가·반환),
  `deletePreset`, `renamePreset`, `applyPresetToConfig`(opId 머지·미존재 opId 무시·port 유지·불변성).
- **MockServerModal.test.tsx**: 현재 설정 저장→드롭다운 노출, 프리셋 선택 시 confirm→적용,
  삭제, 프리셋 0개 힌트.
- **ProxyModal.test.tsx**: "전체 Mock으로"→제목 입력→`onSendAllToMock(records, "제목")` 호출,
  빈 제목 저장 비활성.
- **App 핸들러**(기존 proxy-to-mock 흐름 재사용): 제목 받아 프리셋 생성, 활성 config 불변.

## 영향 범위 / 비범위

- 변경: `mock-config.ts`(+프리셋 CRUD), `MockServerModal.tsx`(프리셋 바),
  `ProxyModal.tsx`(제목 입력), `App.tsx`(`sendAllRecordingsToMock` 시그니처), 관련 CSS.
- 비범위: Rust mock 서버(변경 없음 — 활성 config에서 라우트 생성하는 기존 경로 그대로),
  프리셋 import/export, 전역(스펙 무관) 프리셋, 단건 "Mock으로"의 프리셋화.
