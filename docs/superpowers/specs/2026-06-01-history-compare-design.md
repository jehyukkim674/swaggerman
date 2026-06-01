# 히스토리 비교(요청·응답 diff) 설계

## 목적

히스토리에 저장된 두 실행 기록을 골라, **요청 파라미터 차이**와 **응답 차이**를 한 화면에서 비교한다.
회귀 확인(같은 요청의 결과 변화)과 요청 구성 차이 파악(무엇을 다르게 보냈나)에 쓴다.

## UX

1. 사이드바 **히스토리 탭**에서 각 항목에 체크박스 표시(비교 선택용).
2. **2개 선택**되면 목록 상단에 `비교 (2)` 버튼 활성화 → 클릭 시 **비교 모달**.
3. 비교 모달(2열 A│B):
   - **메타**: method · URL · 상태코드(색) · 실행 시각 · 소요시간
   - **요청 diff**: pathParams / queryParams / headers — 키별 `추가/삭제/변경/동일` 색 표시, body는 줄 diff
   - **응답 diff**: 상태코드 비교 + 응답 body 줄 diff(추가=초록, 삭제=빨강)
4. 3개째 선택 시 가장 오래된 선택이 해제된다(항상 최대 2개).

## 구조

| 파일 | 역할 |
|------|------|
| `core/diff.ts` (+test) | 순수 diff 로직: `diffRecords`, `diffLines`(LCS) |
| `components/CompareModal.tsx` | 비교 모달 UI(2열 + diff 렌더) |
| `components/Sidebar.tsx` | 히스토리 항목 비교 선택 체크박스 + `비교` 버튼 |
| `App.tsx` | 선택 상태·모달 열기 배선 |

## core/diff.ts API

```ts
type FieldDiff = { key: string; a?: string; b?: string; status: "added" | "removed" | "changed" | "same" };
function diffRecords(a: Record<string,string>, b: Record<string,string>): FieldDiff[];
// status 기준: a에만 있으면 removed, b에만 있으면 added, 값 다르면 changed.

type LineOp = { type: "equal" | "add" | "remove"; text: string };
function diffLines(a: string, b: string): LineOp[];
// LCS 기반 줄 단위 diff. JSON은 호출부에서 pretty 후 전달.
```

- RequestParam[](query/header)은 호출부에서 enabled 항목만 `Record<string,string>`로 변환해 비교.

## 비포함(YAGNI)

- 단어 단위(intra-line) diff, 3개 이상 비교, diff 내보내기, 응답 헤더 diff.

## 테스트

- `diff.test.ts`: diffRecords(추가/삭제/변경/동일), diffLines(동일/추가/삭제/혼합/빈 입력) 단위 테스트.
- 기존 테스트 영향 없음(신규 파일 + Sidebar/App 소폭 변경).
