# UI 다듬기: 설정 아이콘·검색 단축키·ⓧ 닫기·복사 버튼 위치 (2026-06-01)

사용자 스크린샷 3장 기반 UI 개선. 기능 추가 없이 발견성(discoverability)과 일관성을 높인다.

## 1. 설정(⚙) 아이콘 확대

- 위치: 상단바 설정 버튼(`App.tsx` 네트워크 설정 버튼)
- 변경: ⚙︎ 글리프를 `font-size: 17px`로 확대하되 `line-height`를 고정해 **버튼 외형 크기는 기존과 동일** 유지
- 구현: `<span className="gear-glyph">⚙︎</span>` + CSS

## 2. 응답 검색 개선

- **⌘F / Ctrl+F**: Response 탭이 보일 때 누르면 검색 입력으로 포커스(웹뷰 기본 찾기 동작은 차단)
- **검색 지우기 X → ⓧ**: 동그라미 안 X 모양 SVG 아이콘(`CloseCircleIcon`, lucide circle-x 스타일)으로 교체
- **다른 닫기/지우기 X도 동일 적용**: 모달 닫기 9곳(Settings/Projects/Authorize/Collections/Compare/CurlImport/Environments/GlobalHeaders/Runner), 프로젝트 삭제 ✕, 파라미터·목록 행 삭제 ✕(RequestEditor/TestPanel/CollectionsModal/EnvironmentsModal)
- 제외: 텍스트가 같이 있는 버튼(`✕ 취소`, `✕파일`), 상태 표시(✓/✕)

## 3. 응답 본문 복사 버튼 위치 이동

- 기존: 응답 본문 우하단 플로팅 버튼(`body-copy-fab`)
- 변경: **검색바 오른쪽 끝**(매치 네비게이션 ‹ n/m › 옆)으로 이동, 우하단 플로팅 버튼은 제거
- 동작 동일: Pretty/Raw 모드에 따라 해당 본문을 클립보드에 복사, 복사 후 ✓ 피드백

## 구현 노트

- 새 아이콘은 `icons.tsx`에 `CloseCircleIcon`으로 추가(기존 CopyIcon 패턴, currentColor)
- 테스트: ⌘F 포커스, 복사 버튼 위치(검색바 내부 존재 + FAB 부재), 검색 지우기 ⓧ(svg) 렌더링
- 버전: v0.3.17
