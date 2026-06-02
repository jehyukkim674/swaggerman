# 커스텀 Select 드롭다운 + 새 창 확인 다이얼로그 설계

날짜: 2026-06-02

## 배경

- 사이드바 태그 필터 등 앱 전역의 `<select>`는 네이티브 OS 팝업을 사용해 다크 테마와 어울리지 않음(트리거는 꾸며져 있으나 옵션 목록은 못 꾸밈).
- 태그가 많은 spec(20개+)에서는 태그를 찾기 위해 검색이 필요함.
- 상단바 "새 창" 버튼이 확인 없이 즉시 창을 생성함 → 실수 클릭 방지를 위한 확인 다이얼로그 필요.

## 목표

1. 앱 전역 네이티브 `<select>` 12곳을 다크 테마 커스텀 드롭다운으로 교체.
2. 태그 필터에는 드롭다운 내부 검색 지원.
3. "새 창" 클릭 시 예쁜 확인 다이얼로그 표시.

## 컴포넌트 설계

### 1. `components/Select.tsx` — 공용 커스텀 드롭다운

```ts
interface SelectOption {
  value: string;
  label: string;
  hint?: string;        // 오른쪽 보조 텍스트(태그별 API 개수 등)
  color?: string;       // 라벨 색(메서드 색상 등, 선택)
}

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  searchable?: boolean;        // true면 패널 상단에 검색창
  placeholder?: string;        // value가 빈 값일 때 트리거에 표시
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;          // 트리거에 부여(기존 .project-select 등 폭 제어 유지)
  title?: string;
}
```

- 트리거: 기존 `select` CSS와 동일한 외형(bg-3 + 테두리 + chevron) → 레이아웃 변화 없음.
- 패널: 트리거 아래 절대배치, `--bg-2` 배경 + 테두리 + 그림자 + 둥근 모서리, 최대 높이 + 스크롤.
- 선택 항목: ✓ 체크 + accent 색. hover/키보드 활성 항목: `--bg-3` 배경.
- 키보드: ↑↓ 이동, Enter 선택, Esc 닫기. 바깥 클릭 시 닫힘.
- `searchable`: 패널 최상단 검색창(autoFocus), 입력 시 옵션 즉시 필터.

### 2. `components/ConfirmDialog.tsx` — 공용 확인 다이얼로그

```ts
interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;   // 기본 "확인"
  cancelLabel?: string;    // 기본 "취소"
  onConfirm: () => void;
  onCancel: () => void;
}
```

- 기존 `.modal-overlay`/`.modal` 패턴 재사용, 폭 ~380px의 작은 다이얼로그.
- 버튼: 취소(기본) + 확인(accent primary). Esc/배경 클릭 = 취소.
- 새 창 외 다른 확인(삭제 등)에도 재사용 가능한 범용 컴포넌트.

## 교체 대상 (12곳)

| 파일 | 위치 | 검색 |
|---|---|---|
| Sidebar.tsx | 태그 필터 | O (+태그별 개수) |
| App.tsx | 프로젝트 전환, 환경 전환 | X |
| CollectionsModal.tsx | 대상 컬렉션 | X |
| AiPanel.tsx | AI 모델 | X |
| RunnerModal.tsx | 컬렉션 선택 | X |
| TestPanel.tsx | 2곳 | X |
| AuthorizeModal.tsx | 2곳 | X |
| RequestEditor.tsx | 2곳 | X |

## 스타일

- 새 색상 없이 기존 CSS 변수(`--bg-2`, `--bg-3`, `--border`, `--accent`, `--text`, `--muted`)만 사용.
- 기존 `palette-*`(⌘K), `snippet-dropdown` 스타일 패턴을 따름.

## 테스트

- `Select.test.tsx`: 열기/닫기, 검색 필터, 항목 선택 시 onChange, 키보드 내비게이션, Esc/바깥 클릭 닫기.
- `ConfirmDialog.test.tsx`: 확인/취소 콜백, Esc 닫기.
- 기존 컴포넌트 테스트 회귀 없음 확인.

## 새 창 확인 플로우

- "새 창" 버튼 / ⌘N → ConfirmDialog("새 창 열기", "추가로 SwaggerMan 창을 생성하시겠습니까?")
- 확인 → `openNewWindow()` 호출, 취소 → 닫기만.
