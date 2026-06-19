# "이 API 설명해줘" 설계 (2026-06-19)

## 목표
선택한 엔드포인트를 AI가 신입 개발자용으로 설명한다: ① 무엇을 하는 API인지 ② 현실적인 호출 예시 ③ 자주 하는 실수 3가지. 기존 응답 기반 AI 액션(`askAiAboutResponse`)을 엔드포인트용으로 확장.

## 기존 구조 재활용
- `AiPanel`은 `pendingPrompt`를 받으면 자동으로 한 번 전송(`handleChat`)한다.
- App의 `askAiAboutResponse(kind)`가 패널을 열고 `setAiPendingPrompt(...)`로 프롬프트를 내린다.
- `currentAiContext()`(=buildAiContext)가 엔드포인트/파라미터/응답 스키마 컨텍스트를 조립한다.
- AI는 로컬 `claude` CLI 사용(API 키 불필요).

## 변경
### 1. `core/ai/prompts.ts`
```ts
export function explainApiPrompt(): string;
```
신입용 설명 + 현실적 호출 예시 + 흔한 실수 3가지를 한국어로 요청하는 지시문. 실제 컨텍스트는 buildContext가 함께 전달하므로 지시문만.

### 2. `App.tsx`
- `askAiExplainApi()`: `setAiOpen(true)` + `setAiPendingPrompt(explainApiPrompt())`. 컨텍스트는 기존 `currentAiContext()` 재사용. 응답 없어도 동작.
- RequestEditor에 `onExplainApi={askAiExplainApi}` 전달.

### 3. `components/RequestEditor.tsx`
- 새 prop `onExplainApi?: () => void`.
- `request-header`에 "✦ API 설명" 버튼(↺ 초기화 옆). 클릭 시 `onExplainApi?.()`. 항상 활성(claude 미설치 시 패널이 경고 표시).

## 테스트
- `prompts.test.ts`: `explainApiPrompt()`가 설명·예시·실수 키워드를 포함.
- `RequestEditor.test.tsx`: "API 설명" 버튼 클릭 → `onExplainApi` 호출.

## 비범위(YAGNI)
- 결과 캐싱, 별도 모달, 응답 본문 포함(스키마로 충분).
