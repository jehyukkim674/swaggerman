# 플로우 빌더 (순차) 설계

날짜: 2026-06-03
대상 버전: v0.4.2

## 배경

- 기존 체이닝(요청별 추출 규칙)은 한 요청 단위라, "로그인→토큰추출→생성→검증" 같은 다단계 시나리오를 한눈에 구성·실행하기 어렵다.
- API 단계를 세로로 나열해 순차 실행하며 변수를 전달하는 플로우를 만들면 시나리오를 시각적으로 다룰 수 있다.

## 목표

1. API 단계를 세로로 나열한 플로우 구성(operation + 추출 규칙 + 어서션), 드래그로 순서 재배치.
2. 순차 실행: 단계 응답에서 변수 추출 → 다음 단계 요청에 `{{변수}}`로 전달.
3. 단계별 결과(상태/추출 변수/어서션 통과) 표시. 로컬 저장.

## 비목표 (YAGNI)

- 분기/병합/조건/루프 없음 — 순차 실행만.
- 자유 노드 배치/줌/팬 없음 — 세로 리스트(드래그 재배치만).
- 외부 그래프/DnD 라이브러리 없음 — HTML5 draggable.
- 플로우 공유/내보내기 없음 — 로컬 저장만.

## 데이터 모델

```ts
// core/flow.ts
import type { ExtractRule, Assertion, AssertionResult } from "./variables";

export interface FlowStep {
  id: string;
  opId: string;
  name: string;             // 표시용(기본: METHOD path)
  extractRules: ExtractRule[];
  assertions: Assertion[];
}

export interface Flow {
  id: string;
  name: string;
  steps: FlowStep[];
}

export interface FlowStepResult {
  stepId: string;
  status: number;           // 0 = 네트워크 오류
  ok: boolean;              // 2xx
  durationMs: number;
  assertResults: AssertionResult[];
  extracted: Record<string, string>;
  error?: string;
}
```

저장: `swaggerman.flows.${specUrl}`(Flow[]). 기존 storage.ts.

## 실행 엔진 (기존 인프라 재활용)

`runFlow(flow, execOne, initialVars)`:
- 단계 순차로:
  1. 누적 vars로 `execOne(opId, vars)` 호출 → `{ status, ok, body, durationMs, error? }`(App이 buildRequest+substituteVars+executeRequest로 구현)
  2. 응답 body가 JSON이면 `applyExtractRules(json, step.extractRules)` → 추출 vars를 누적 vars에 병합
  3. `runAssertions(step.assertions, status, body)` → assertResults
  4. FlowStepResult 기록
- 어서션 실패해도 계속(결과만 기록). execOne가 status 0(네트워크 오류) 반환하면 error 기록하고 계속.
- 반환: FlowStepResult[] + 최종 누적 vars.

`execOne` 시그니처: `(opId: string, vars: Record<string,string>) => Promise<{ status: number; ok: boolean; body: string; durationMs: number; error?: string }>`. App이 주입(순수 코어 분리).

## 컴포넌트

| 파일 | 책임 | 의존 |
|---|---|---|
| `core/flow.ts` (신규) | Flow/FlowStep/FlowStepResult, loadFlows/saveFlows, addStep/removeStep/moveStep, runFlow(execOne 주입) | variables(applyExtractRules/runAssertions), storage |
| `core/flow.test.ts` (신규) | CRUD·이동·순차 실행·변수 전달·어서션·오류 | — |
| `components/FlowModal.tsx` (신규) | 플로우 선택/생성, 단계 세로 리스트(드래그 재배치, operation Select, 추출/어서션 편집), 전체 실행 + 단계별 결과 | flow, Select, (TestPanel 요소 일부 재활용 가능) |
| `components/FlowModal.test.tsx` (신규) | 단계 추가·재배치·실행 결과 | — |
| `App.tsx` (수정) | 상단바 "플로우" 버튼 + 모달 + execStep 콜백 | FlowModal |
| `App.css` (수정) | `.flow-*` 스타일 | — |

## 드래그 재배치

HTML5 draggable: 단계 행에 `draggable`, `onDragStart`(인덱스 기록), `onDragOver`(preventDefault), `onDrop`(moveStep). 핸들(≡) 표시. 외부 라이브러리 없음.

## 단계 편집

- operation 선택: 공용 Select(전체 operation).
- 추출 규칙: varName + JSONPath 행 추가/삭제(기존 TestPanel의 추출 UI 패턴 재활용 — ExtractRule 동일 타입).
- 어서션: kind/op/expected 행(기존 Assertion 동일 타입).
- 단계 name 편집(기본 "METHOD path").

## 데이터 흐름

1. "플로우" 버튼 → 모달: loadFlows. 없으면 "새 플로우" 생성 안내.
2. 플로우 선택/생성 → 단계 추가(operation) → 추출/어서션 편집 → 자동 저장(saveFlows).
3. 드래그로 단계 순서 변경 → moveStep → 저장.
4. "전체 실행" → `runFlow(flow, execStep, activeVars)` → 단계별 결과 인라인(상태색·추출 변수 칩·어서션 ✅/❌).

## 에러 처리

- spec 미로드 → 버튼 비활성
- 단계 0개 → 실행 비활성
- operation 삭제됨(스펙 변경) → 해당 단계 "없는 operation" 표시, 실행 시 skip + error
- JSON 아닌 응답 → 추출 skip(빈 추출), 어서션 jsonpath는 실패로

## 테스트

- `core/flow.test.ts`:
  - addStep/removeStep/moveStep(인덱스 이동) 동작
  - runFlow: execOne 호출 순서(단계 순), 1단계 추출 변수가 2단계 execOne의 vars에 포함, 어서션 결과 기록, execOne status 0이면 error 기록 후 계속, JSON 아닌 응답 추출 skip
  - loadFlows/saveFlows 라운드트립
- `components/FlowModal.test.tsx` (jsdom): 단계 추가, 드래그 재배치(moveStep 반영), 전체 실행→execStep 호출·단계 결과 렌더

## 릴리스

v0.4.2 묶음(프록시·성능·가이드·시간여행·플로우)의 마지막. 5개 완료 후 v0.4.2 버전 범프 + CHANGELOG + 배포.
