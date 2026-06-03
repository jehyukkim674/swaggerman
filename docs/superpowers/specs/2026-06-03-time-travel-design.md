# API 시간여행 설계

날짜: 2026-06-03
대상 버전: v0.4.2

## 배경

- "어제 이 API가 뭘 반환했지?", "장애 전후로 응답이 어떻게 바뀌었지?"를 추적하고 싶다.
- 선택한 API의 응답을 주기적으로 스냅샷 저장하면 시간축으로 과거를 탐색·비교할 수 있다.

## 목표

1. 대상 API들을 골라 **수동("지금 스냅샷") 또는 자동 주기(앱 열린 동안)**로 응답 캡처·저장.
2. opId별 시간축 타임라인으로 과거 스냅샷 탐색, 응답 본문 보기.
3. 두 스냅샷 선택 → 기존 비교 모달(CompareModal)로 diff.

## 비목표 (YAGNI)

- 앱 꺼진 동안 백그라운드 캡처 없음 — Tauri 앱이 열려 있을 때만 자동 주기 동작.
- 무한 보관 없음 — 스냅샷 200개 cap.
- 자동 변경 감지/알림 없음 — 사람이 타임라인 보고 판단.
- 자동 주기는 고정 선택지(1/5/15/30분).

## 데이터 모델

```ts
// core/snapshots.ts
export interface Snapshot {
  id: string;
  opId: string;
  at: number;        // executedAt(ms)
  method: string;
  path: string;
  status: number;
  body: string;
  durationMs: number;
}

export interface TimeTravelConfig {
  opIds: string[];     // 대상 operation
  intervalMin: number; // 1/5/15/30
  autoOn: boolean;
}
```

저장: `swaggerman.snapshots.${specUrl}`(Snapshot[], 최근 200개 cap), `swaggerman.ttconfig.${specUrl}`(TimeTravelConfig). 기존 storage.ts loadJSON/saveJSON.

## 컴포넌트

| 파일 | 책임 | 의존 |
|---|---|---|
| `core/snapshots.ts` (신규) | Snapshot/TimeTravelConfig 타입, loadSnapshots/saveSnapshots(200 cap), addSnapshot, loadTTConfig/saveTTConfig, groupByOp(opId별 시간순 정렬) | storage.ts |
| `core/snapshots.test.ts` (신규) | 저장·cap·그룹화·addSnapshot | — |
| `components/TimeTravelModal.tsx` (신규) | 대상 API 체크 + "지금 스냅샷" + 자동주기 토글/간격 Select + 타임라인(op별 스냅샷 칩) + 응답 보기 + 2개 선택 비교 | snapshots, Select |
| `components/TimeTravelModal.test.tsx` (신규) | 캡처·타임라인·비교 선택 | — |
| `App.tsx` (수정) | 상단바 "시간여행" 버튼 + 모달 + captureSnapshots 콜백 + 자동주기 useEffect + 스냅샷 비교→CompareModal | TimeTravelModal |
| `App.css` (수정) | `.tt-*` 스타일 | — |

## 캡처 실행

- `captureSnapshots(opIds)`: 각 opId의 operation을 defaultInputs로 실행(기존 runForPersona/runSaved 패턴 — buildRequest + computeSecurityHeaders(authValues) + executeRequest). 응답을 Snapshot으로 addSnapshot.
- 자동 주기: App에서 `useEffect`로 `config.autoOn && config.opIds.length>0`일 때 `setInterval(captureSnapshots, intervalMin*60000)`. cleanup으로 해제. 모달 닫혀도 앱 열려 있으면 동작(config 기준).

## 비교

- 타임라인에서 스냅샷 2개 선택 → "비교" → 기존 CompareModal 재사용. CompareModal이 HistoryItem 2개를 받는 형태이므로, Snapshot→HistoryItem 어댑터(`snapshotToHistoryItem`)로 변환해 전달(method/path/status/durationMs/executedAt/responseBody 매핑, inputs는 빈 기본값, responseHeaders {}).

## 데이터 흐름

1. "시간여행" 버튼 → 모달: loadTTConfig + loadSnapshots
2. 대상 op 체크/간격/자동 토글 → saveTTConfig
3. "지금 스냅샷" → captureSnapshots(config.opIds) → addSnapshot → 타임라인 갱신
4. 자동 ON → App useEffect setInterval 주기 캡처
5. 타임라인 스냅샷 클릭 → 응답 body 보기. 2개 체크 → "비교" → CompareModal

## 에러 처리

- spec 미로드 → 버튼 비활성
- 대상 0개 → "지금 스냅샷"/자동 비활성
- 캡처 중 네트워크 오류 → status 0 스냅샷(에러 표시)
- 스냅샷 0개 op → 타임라인 "기록 없음"

## 테스트

- `core/snapshots.test.ts`: 저장/복원, 200 cap(초과 시 오래된 것 drop), groupByOp(opId별·시간 오름차순), addSnapshot, TTConfig 저장/복원
- `components/TimeTravelModal.test.tsx` (jsdom): 대상 체크, "지금 스냅샷"→onCapture 호출, 타임라인 스냅샷 렌더, 2개 선택→onCompare 콜백, 자동 토글→config 저장

## 릴리스

v0.4.2 묶음의 하나. 묶음 완료 후 함께 배포.
