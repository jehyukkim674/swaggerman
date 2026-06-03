// 순차 플로우: API 단계를 순서대로 실행하며 변수를 전달한다. 실행 함수는 주입(순수 코어).
import { loadJSON, saveJSON } from "./storage";
import {
  applyExtractRules,
  runAssertions,
  type ExtractRule,
  type Assertion,
  type AssertionResult,
} from "./variables";

export interface FlowStep {
  id: string;
  opId: string;
  name: string;
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
  status: number;
  ok: boolean;
  durationMs: number;
  assertResults: AssertionResult[];
  extracted: Record<string, string>;
  error?: string;
}

/** App이 주입하는 단계 실행 함수 결과. */
export interface ExecResult {
  status: number;
  ok: boolean;
  body: string;
  durationMs: number;
  error?: string;
}

export type ExecOne = (opId: string, vars: Record<string, string>) => Promise<ExecResult>;

let seq = 0;
function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${seq++}`;
}

export function newFlow(name: string): Flow {
  return { id: uid("flow"), name, steps: [] };
}

export function addStep(flow: Flow, opId: string, name: string): Flow {
  return {
    ...flow,
    steps: [
      ...flow.steps,
      { id: uid("step"), opId, name, extractRules: [], assertions: [] },
    ],
  };
}

export function removeStep(flow: Flow, stepId: string): Flow {
  return { ...flow, steps: flow.steps.filter((s) => s.id !== stepId) };
}

/** from 인덱스의 단계를 to 인덱스로 이동. */
export function moveStep(flow: Flow, from: number, to: number): Flow {
  const steps = [...flow.steps];
  if (from < 0 || from >= steps.length || to < 0 || to >= steps.length) return flow;
  const [moved] = steps.splice(from, 1);
  steps.splice(to, 0, moved);
  return { ...flow, steps };
}

export function loadFlows(specUrl: string): Flow[] {
  return loadJSON<Flow[]>(`swaggerman.flows.${specUrl}`, []);
}

export function saveFlows(specUrl: string, flows: Flow[]): void {
  saveJSON(`swaggerman.flows.${specUrl}`, flows);
}

/** 플로우를 순차 실행한다. 단계마다 누적 vars로 execOne 호출 → 추출 변수 병합 → 어서션.
 *  어서션 실패/오류여도 계속 진행하고 결과만 기록한다. */
export async function runFlow(
  flow: Flow,
  execOne: ExecOne,
  initialVars: Record<string, string>,
): Promise<{ results: FlowStepResult[]; vars: Record<string, string> }> {
  const vars: Record<string, string> = { ...initialVars };
  const results: FlowStepResult[] = [];

  for (const step of flow.steps) {
    const res = await execOne(step.opId, vars);
    const extracted = res.body ? applyExtractRules(res.body, step.extractRules) : {};
    Object.assign(vars, extracted);
    // 네트워크 오류(error 있음 또는 status === 0)인 단계는 어서션을 건너뛴다.
    // ERR 뱃지와 어서션 실패가 중복 보고되는 혼란을 방지한다.
    const assertResults =
      res.error || res.status === 0
        ? []
        : runAssertions(res.status, res.body, step.assertions);
    results.push({
      stepId: step.id,
      status: res.status,
      ok: res.ok,
      durationMs: res.durationMs,
      assertResults,
      extracted,
      error: res.error,
    });
  }

  return { results, vars };
}
