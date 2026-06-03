# API 성능 추이 설계

날짜: 2026-06-03
대상 버전: v0.4.2

## 배경

- 히스토리에 모든 요청의 응답시간(durationMs)·시각(executedAt)·opId가 이미 쌓인다.
- 이걸 operation별로 집계하면 어떤 API가 느린지, 점점 느려지는지 한눈에 볼 수 있다.

## 목표

1. 히스토리를 operation별로 묶어 응답시간 통계(호출수/평균/min/max/p50/p95)와 시계열 스파크라인 표시.
2. **느려지는 API 자동 감지** — 최근 절반 평균이 이전 절반 평균보다 임계 이상 증가하면 경고.
3. 외부 차트 라이브러리 없이 SVG로.

## 비목표 (YAGNI)

- 영속 통계 저장 없음 — 히스토리에서 매번 계산(히스토리 자체가 영속).
- 알림/임계 커스터마이즈 UI 없음 — 임계 고정(느려짐 1.3배, 빨라짐 0.77배).
- 시간축 눈금/상세 툴팁 없음 — 스파크라인은 추이 시각화만.
- 상태코드별 분리 집계 없음 — 모든 응답을 시간 집계에 포함.

## 데이터 모델

```ts
// core/perf-trend.ts
export type PerfTrend = "slower" | "faster" | "stable" | "insufficient";

export interface PerfStat {
  opId: string;
  method: string;
  path: string;
  count: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  /** 시간순(오래된→최근) durationMs 시계열 (스파크라인용) */
  series: number[];
  trend: PerfTrend;
}
```

## 집계 로직

- 입력: `HistoryItem[]` (opId/method/path/durationMs/executedAt 사용).
- opId별 그룹화 → 각 그룹을 executedAt 오름차순 정렬.
- avg/min/max: 산술. p50/p95: 정렬된 durationMs에서 `sorted[ceil(p/100 * n) - 1]`(최소 인덱스 0). series: 정렬된 순서의 durationMs 배열.
- **추이 판정**(`detectTrend(series)`):
  - n < 4 → "insufficient"
  - 앞 절반 평균 `olderAvg`, 뒤 절반 평균 `recentAvg`(홀수면 가운데는 뒤 절반에). olderAvg가 0이면 "stable".
  - `recentAvg / olderAvg > 1.3` → "slower", `< 0.77` → "faster", 그 외 "stable".
- `computePerfTrends(history)`: opId별 PerfStat[] 반환. 기본 정렬은 avgMs 내림차순(느린 API 위로).

## 컴포넌트

| 파일 | 책임 | 의존 |
|---|---|---|
| `core/perf-trend.ts` (신규) | PerfStat/PerfTrend, computePerfTrends, detectTrend, percentile | 없음(HistoryItem 타입만) |
| `core/perf-trend.test.ts` (신규) | 집계·백분위·추이 테스트 | — |
| `components/Sparkline.tsx` (신규) | `values: number[]` → SVG polyline 미니차트. width/height/color props. 빈 배열이면 빈 svg, 단일값이면 수평선 | 없음 |
| `components/Sparkline.test.tsx` (신규) | points 생성·엣지 | — |
| `components/PerfModal.tsx` (신규) | op별 표(메서드/경로/호출수/평균/p95/스파크라인/추이 뱃지), 평균·p95·추이 정렬 | perf-trend, Sparkline |
| `components/PerfModal.test.tsx` (신규) | 표 렌더·정렬·뱃지 | — |
| `App.tsx` (수정) | 상단바 "성능" 버튼(history 있을 때) + 모달 | PerfModal |
| `App.css` (수정) | `.perf-*` 스타일 | — |

## UI

상단바 "성능" 버튼 → PerfModal:
```
API                     호출  평균    p95    추이
GET /pet/findByStatus    24   142ms  380ms  [스파크라인] ⚠️ 느려지는 중
GET /pet/{petId}         18    45ms   90ms  [스파크라인] ✅ 빨라짐
POST /pet                 5   210ms  340ms  [스파크라인] — 안정
```
- 스파크라인 색: slower 빨강(#f85149) / faster 초록(#3fb950) / stable·insufficient 회색(var(--muted))
- 추이 뱃지: ⚠️ 느려지는 중 / ✅ 빨라짐 / — (안정·데이터부족)
- 헤더 클릭으로 평균/p95/추이 정렬 토글

## 데이터 흐름

1. "성능" 버튼 → 현재 `history`(App state) 전달
2. PerfModal이 `computePerfTrends(history)` → PerfStat[]
3. 표 렌더 + 정렬 상태. 각 행 `<Sparkline values={stat.series} color={추이색} />`

## 에러 처리

- 히스토리 0건 → 버튼 비활성(title "기록 없음")
- 단일 데이터 op → series 길이 1, 스파크라인 수평선, 추이 insufficient

## 테스트

- `core/perf-trend.test.ts`:
  - computePerfTrends: opId별 분리, count/avg/min/max 정확, p50/p95 백분위
  - detectTrend: 명백히 증가하는 series→slower, 감소→faster, 평탄→stable, 3건 이하→insufficient
  - 정렬: avgMs 내림차순 기본
- `components/Sparkline.test.tsx`: values→polyline points 개수, 빈 배열→points 없음, 단일값→수평선
- `components/PerfModal.test.tsx` (jsdom): 표 행 수, 추이 뱃지 텍스트, 정렬 헤더 클릭

## 릴리스

v0.4.2 묶음(프록시·성능·가이드·시간여행·플로우) 중 하나. 묶음 완료 후 함께 배포.
