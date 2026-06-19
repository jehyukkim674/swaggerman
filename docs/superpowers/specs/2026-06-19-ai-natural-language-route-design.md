# 자연어 → API 실행 (라우팅) 설계 (2026-06-19)

## 목표
AI 패널에 자연어 의도를 입력하면, AI가 **스펙 전체에서 가장 알맞은 엔드포인트를 골라 이동**하고 **그 폼을 자동 작성**한다. 사용자는 "폼에 적용" 후 Send로 실행한다.

## 범위 (v1)
- 단일 엔드포인트 선택 + 폼 작성. **다단계 체이닝(로그인→추출→호출)은 비범위**(플로우 빌더가 담당, 차후 AI 자동작성).
- 기존 AI 플럼빙 재활용: `provider.complete`, `handleRequestBuild`(폼 제안 카드), `selectOperation`.

## 로직 — `core/ai/route.ts`
```ts
interface RouteOp { id: string; method: string; path: string; summary?: string; tags?: string[] }
export function buildRoutePrompt(ops: RouteOp[], intent: string): string;
export function parseRouteId(raw: string, validIds: string[]): string | null; // JSON 또는 본문에서 operationId 추출·검증
export const ROUTE_SCHEMA: object; // { operationId, reason? }
```
- 프롬프트: operation 목록(id·method·path·summary·tags)을 주고 의도에 가장 맞는 `operationId` 하나를 JSON으로 답하라고 지시.
- `parseRouteId`: JSON 파싱 실패 시 본문에서 유효 id 매칭 폴백. 유효하지 않으면 null.

## UI — `AiPanel`
- 새 프리픽스 **`/찾아 <자연어>`**(ROUTE_PREFIX). `send()`에서 분기 → `handleRoute(intent)`.
- `handleRoute`: `complete(buildRoutePrompt(routeOperations, intent), ROUTE_SCHEMA)` → `parseRouteId` →
  - 성공: `onRoute(opId, intent)` 호출 + assistant 메시지 "→ {path} 로 이동, 폼을 채웁니다".
  - 실패: 에러 메시지.
- 새 props: `routeOperations?: RouteOp[]`, `onRoute?: (opId, intent) => void`.
- 폼 자동작성: App이 `onRoute`에서 `selectOperation` + `pendingFill(intent)` 설정 → AiPanel의 `pendingFill` effect가 새 컨텍스트로 `handleRequestBuild(intent)` 실행 → 제안 카드.
- 빈 상태 힌트에 `/찾아` 안내 추가.

## App 배선
- `routeOperations = spec.operations.map(o => ({id,method,path,summary,tags}))`.
- `onRoute(opId, intent)`: `op = spec.operations.find(id)` → `selectOperation(op)` → `setAiPendingFill(intent)`.
- `aiPendingFill` 상태 + `pendingFill`/`onPendingFillConsumed` props.

## 테스트
- `route.test.ts`: `buildRoutePrompt`가 의도·경로 포함, `parseRouteId`(JSON/폴백/무효 null).
- `AiPanel.test.tsx`: `/찾아` 입력 시 complete 호출 + `onRoute(opId, intent)` 호출. `pendingFill`로 제안 카드 생성.

## 비범위(YAGNI)
- 다단계 체이닝/실행, 자동 Send(안전상 사용자 확인 유지), 여러 후보 제시.
