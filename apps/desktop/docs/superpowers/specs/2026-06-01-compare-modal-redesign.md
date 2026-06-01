# 히스토리 비교 모달 개편: 2단 레이아웃·미니맵·검색·변경 구분 (2026-06-01)

## 배경

- 비교 모달이 세로 나열이라 응답 BODY diff를 보기 좁고(960px), 큰 응답에서 모든 줄을 DOM으로 렌더링해 느림
- diff가 추가(+)/삭제(–)만 구분하고 "변경된 줄"을 별도 표기하지 않음
- 검색·미니맵이 없어 큰 diff에서 차이 위치를 찾기 어려움

## 레이아웃

- 모달 폭: `min(960px, 94vw)` → **`min(1600px, 96vw)`**, 높이 `90vh` 고정(2단이 공간 활용)
- **왼쪽(40%)**: 요청 정보 — 메타(요청/URL/상태/실행), Path/Query 파라미터, Headers, 요청 Body diff
- **오른쪽(60%)**: 응답 BODY diff 전용 — 검색바 + diff 뷰(가상 스크롤) + 미니맵

## 코어 API 계약 (병렬 작업용 고정 인터페이스)

### core/diff.ts 추가

```ts
export type MarkedLineType = "equal" | "added" | "removed" | "changed-a" | "changed-b";
export interface MarkedLineOp {
  type: MarkedLineType;
  text: string;
}
/** diffLines 결과를 후처리: 같은 변경 묶음(hunk)에 remove와 add가 함께 있으면
 *  changed-a(변경 전)/changed-b(변경 후)로 재분류. remove만 있으면 removed, add만 있으면 added. */
export function diffLinesMarked(aText: string, bText: string): MarkedLineOp[];
```

### components/Minimap.tsx Props 확장

```ts
interface Props {
  lines: string[];
  scrollRef: React.RefObject<HTMLElement | null>;
  matchLines: Set<number>;
  /** 줄 인덱스 → CSS 색상 문자열. diff 위치 표시용(검색 매치보다 낮은 우선순위). */
  marks?: Map<number, string>;
}
```

### core/minimap.ts — buildMinimapBuckets에 marks 지원

```ts
export interface MinimapBucket {
  len: number;
  match: boolean;
  /** 버킷 내 marks 색상(첫 번째 것). 없으면 undefined. */
  color?: string;
}
export function buildMinimapBuckets(
  lines: string[],
  bucketCount: number,
  matchLines: Set<number>,
  marks?: Map<number, string>,
): MinimapBucket[];
```

## 응답 BODY diff 뷰 (CompareModal 내부)

- **가상 스크롤**: JsonView와 동일 패턴(고정 줄 높이 18px, 보이는 범위 + overscan만 렌더)
- **색상**: 추가(초록 #3fb950) / 삭제(빨강 #f85149) / 변경 전·후(주황 #d29922) / 검색 매치(파랑 mark) / 활성 매치(진한 파랑 + 테두리)
- **검색**: 입력 + Enter 제출 → 매치 줄 하이라이트 + ‹ n/m › 네비게이션 + 미니맵 매치 표시
- **미니맵**: diff 줄 위치를 색상 마크로, 검색 매치를 기존 매치 색으로 표시. 클릭/드래그 이동 동일
- **범례**: + 추가 / – 삭제 / ~ 변경 / 검색 매치 4종

## 테스트

- diff: changed 재분류(혼합 hunk), 순수 추가/삭제 hunk 보존, 대용량 폴백 경로
- minimap: marks 색상 버킷 집계
- CompareModal: 2단 레이아웃, diff 색상 클래스, 검색 매치/네비게이션 (jsdom)

## 버전

- v0.3.20
