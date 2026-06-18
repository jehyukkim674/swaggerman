# 히스토리 검색·필터 설계 (2026-06-19)

## 목표
사이드바 히스토리 탭의 평면 리스트에 검색·필터를 추가해 많은 요청 기록에서 원하는 항목을 빠르게 찾는다.

## 필터 기준
- **텍스트**: `path`·`url`·`opId` 부분일치(대소문자 무시). 공백이면 무시.
- **HTTP 메서드**: 다중 선택 토글(빈 선택 = 전체).
- **상태코드 그룹**: 2xx/3xx/4xx/5xx 다중 선택(`Math.floor(status/100)`). 빈 선택 = 전체. 네트워크 오류(status 0)는 상태 필터 미선택 시에만 노출.
- **시간 범위**: 최근 1시간 / 오늘 / 최근 7일 / 전체(단일 선택) → `since`(ms cutoff)로 환산.

## 데이터/로직 — `core/history.ts`
```ts
export interface HistoryFilter {
  text: string;
  methods: string[];      // 빈 배열 = 전체
  statusGroups: number[]; // 예: [2,4]; 빈 배열 = 전체
  since: number | null;   // null = 전체
}
export function filterHistory(items: HistoryItem[], f: HistoryFilter): HistoryItem[];
export function isFilterActive(f: HistoryFilter): boolean;
```
순수 함수 — UI와 분리해 단위 테스트. AND 결합(모든 조건 충족).

## UI — `components/Sidebar.tsx`의 `HistoryTab`
- **검색창 항상 노출**: 헤드 상단 input(`경로·URL 검색`).
- **"필터" 토글 버튼**: 활성 필터 수 배지. 펼치면 → 메서드 칩, 상태 칩(2xx~5xx), 기간 셀렉트.
- **결과 카운트**: 필터 시 `N / 전체개`, 아니면 기존 `N개 요청`.
- **빈 결과**: "조건에 맞는 요청이 없습니다." + 필터 초기화 버튼.
- **전체 삭제(동적 라벨)**: 필터 활성 시 "보이는 N개 삭제" → 보이는 id만 제거(`onDelete` 반복 호출), 비활성 시 기존 `onClearHistory`.
- 필터 상태는 `HistoryTab` 로컬 useState(새로고침·탭전환 시 초기화 — 단순성 우선).

## 비교 기능 호환
`compareIds`는 id 기반 → 필터로 가려져도 `history.find`로 비교 가능(기존 로직 변경 없음).

## 테스트
- `history.test.ts`: `filterHistory`/`isFilterActive` 단위 테스트(텍스트·메서드·상태그룹·시간·조합·빈 필터·status 0 처리).
- `Sidebar.test.tsx`: 검색 입력 시 리스트 축소, 메서드/상태 칩 토글, 동적 삭제 라벨, 빈 결과 표시.

## 비범위(YAGNI)
- 필터 상태 영속화, 정규식 검색, 저장된 필터 프리셋.
