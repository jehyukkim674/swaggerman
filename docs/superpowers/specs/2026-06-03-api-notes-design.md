# API 메모 + 상태 태그 설계

날짜: 2026-06-03
대상 버전: v0.4.1

## 배경

- API를 탐색하다 보면 "이 API는 deprecated 예정", "백엔드에 문의함(6/3)", "v2 쓰세요" 같은 맥락 정보를 남기고 싶다.
- 스펙(OpenAPI)에는 그런 운영 메모를 쓸 곳이 없다. 사용자의 로컬 지식으로 남긴다.

## 목표

1. operation별로 **자유 텍스트 메모 + 상태 태그**를 남기고 localStorage에 영구 저장.
2. 요청 화면 상단에서 입력/편집.
3. 사이드바에서 상태를 색상 점으로, 메모 유무를 아이콘으로 한눈에 표시.

## 비목표 (YAGNI)

- 공유/내보내기/가져오기 없음 — 로컬 저장만 (추후 요청 공유 기능과 연계 가능).
- API당 메모는 1개 (여러 코멘트 스레드 아님).
- 검색/필터에 상태 조건 추가 없음 (이번엔 표시만).
- 중앙 서버 동기화 없음 (이 앱은 서버리스).

## 데이터 모델

```ts
// core/notes.ts
export type ApiStatus = "none" | "deprecated" | "review" | "stable" | "blocked";

export interface ApiNote {
  text: string;        // 자유 텍스트 메모 (여러 줄 가능)
  status: ApiStatus;   // 상태 태그
  updatedAt: number;   // 마지막 수정 시각(ms)
}

// 저장 형태: Record<opId, ApiNote>
// localStorage 키: `swaggerman.notes.${specUrl}`
```

opId는 기존 `ParsedOperation.id` (예: `"GET /pet/findByStatus"`)를 그대로 사용 — 즐겨찾기(`swaggerman.fav.*`)와 동일한 키 체계.

## 상태 태그 (5종)

| 값 | 라벨 | 색상 | 점 색 |
|---|---|---|---|
| `none` | (없음) | — | 표시 안 함 |
| `deprecated` | ⚠️ Deprecated | 주황 `#d29922` | 주황 |
| `review` | 🔍 검토중 | 파랑 `var(--accent)` | 파랑 |
| `stable` | ✅ 안정 | 초록 `#3fb950` | 초록 |
| `blocked` | 🚫 사용금지 | 빨강 `#f85149` | 빨강 |

색상은 기존 App.css에서 이미 쓰이는 값과 동일하게 사용(신규 색 도입 없음).

## 컴포넌트 (격리된 단위)

| 파일 | 책임 | 의존 |
|---|---|---|
| `core/notes.ts` (신규) | ApiNote 타입, `loadNotes(specUrl)`/`saveNotes(specUrl, notes)`, 상태 메타 테이블(`STATUS_META`: 라벨/색), `isEmptyNote(note)` | storage.ts |
| `components/ApiNoteEditor.tsx` (신규) | 요청 화면 상단 메모 영역. 상태 드롭다운(공용 `Select`) + textarea. 변경 시 `onChange(note)` 콜백 | Select.tsx, notes.ts |
| `components/RequestEditor.tsx` (수정) | summary 아래에 `<ApiNoteEditor>` 삽입. props로 note/onNoteChange 전달받음 | ApiNoteEditor |
| `components/Sidebar.tsx` (수정) | op-row에 상태 색상 점 + 메모 있으면 📝 아이콘. props로 notes 받음 | notes.ts(STATUS_META) |
| `App.tsx` (수정) | notes state, 영속화 useEffect, 프로젝트 전환 시 로드, RequestEditor·Sidebar에 전달 | notes.ts |
| `App.css` (수정) | `.api-note-*` 영역 + `.op-status-dot` 점 스타일 | — |

## 데이터 흐름

1. 프로젝트 로드(App.tsx의 loadSpec) → `loadNotes(targetUrl)` → `notes` state (Record<opId, ApiNote>)
2. 요청 화면(ApiNoteEditor)에서 메모 텍스트/상태 편집 → `onNoteChange(opId, note)` → App.tsx가 notes state 갱신
3. notes 변경 → 디바운스(400ms) useEffect → `saveNotes(activeSpecUrl, notes)`
4. Sidebar는 notes를 받아 각 op-row 렌더 시 해당 opId의 상태 점/메모 아이콘 표시
5. 빈 메모(text 공백 + status="none")는 저장 시 제거 (`isEmptyNote`) — 저장소 정리

## 에러 처리

- localStorage 파싱 실패 → 빈 객체로 폴백 (기존 loadJSON 패턴)
- 메모 입력 중 프로젝트 전환 → 디바운스 타이머가 이전 specUrl로 저장하지 않도록, 저장 useEffect는 현재 activeSpecUrl 기준으로만 동작

## UI 배치

**요청 화면 상단 (RequestEditor, summary 아래):**
```
GET /pet/findByStatus  [Send]
Finds Pets by status.            ← 기존 summary
┌─ 📝 메모 ───────────────────┐
│ [⚠️ Deprecated  ▾]           │  ← 상태 드롭다운(공용 Select)
│ 6월 제거 예정, 신규는 v2 사용 │  ← textarea (자동저장)
└────────────────────────────┘
Query Params (1) …
```
메모가 비어있고 status=none이면 영역을 접어두고 "+ 메모 추가" 링크만 표시(공간 절약). 클릭 시 펼침.

**사이드바 (Sidebar op-row):**
```
☆ ● GET /pet/findByStatus 📝   ← ● 상태색 점(없으면 자리만), 📝 메모 있을 때
```

## 테스트

- `core/notes.test.ts`: 저장/복원 라운드트립, 빈 노트 정리(isEmptyNote), STATUS_META 라벨/색 존재, 새 opId 추가
- `components/ApiNoteEditor.test.tsx` (jsdom): 텍스트 입력 → onChange 호출, 상태 변경 → onChange, 빈 노트 시 "+ 메모 추가" 접힘 표시 → 클릭 시 펼침
- `components/Sidebar.test.tsx`가 있으면 상태 점/메모 아이콘 렌더 케이스 추가(없으면 생략)
- 전체 회귀 없음

## 릴리스

v0.4.1로 버전 범프. 2차 묶음(메모/공유/권한매트릭스/메뉴바)의 첫 기능이므로, 이 기능만으로 배포하지 않고 묶음 완료 후 배포할 수도 있음(사용자 결정). CHANGELOG에 항목 추가.
