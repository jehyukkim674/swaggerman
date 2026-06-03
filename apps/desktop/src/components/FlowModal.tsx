// 순차 플로우 빌더: 단계 나열·드래그 재배치·순차 실행·단계별 결과.
import { useState } from "react";
import type { ParsedSpec } from "../core/types";
import {
  loadFlows,
  saveFlows,
  newFlow,
  addStep,
  removeStep,
  moveStep,
  runFlow,
  type Flow,
  type FlowStep,
  type FlowStepResult,
  type ExecOne,
} from "../core/flow";
import type { ExtractRule, Assertion } from "../core/variables";
import { Select } from "./Select";
import { methodColor, statusColor } from "./method";
import { CloseCircleIcon, TrashIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";

interface Props {
  specUrl: string;
  spec: ParsedSpec;
  initialVars: Record<string, string>;
  execOne: ExecOne;
  onClose: () => void;
}

export function FlowModal({ specUrl, spec, initialVars, execOne, onClose }: Props) {
  useEscToClose(onClose);
  const [flows, setFlows] = useState<Flow[]>(() => loadFlows(specUrl));
  const [activeId, setActiveId] = useState<string | null>(
    () => loadFlows(specUrl)[0]?.id ?? null,
  );
  const [results, setResults] = useState<Record<string, FlowStepResult>>({});
  const [running, setRunning] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [newOpId, setNewOpId] = useState(spec.operations[0]?.id ?? "");

  const active = flows.find((f) => f.id === activeId) ?? null;

  const persist = (next: Flow[]) => {
    setFlows(next);
    saveFlows(specUrl, next);
  };

  const updateActive = (fn: (f: Flow) => Flow) => {
    if (!active) return;
    persist(flows.map((f) => (f.id === active.id ? fn(f) : f)));
  };

  const createFlow = () => {
    const f = newFlow(`플로우 ${flows.length + 1}`);
    persist([...flows, f]);
    setActiveId(f.id);
  };

  const addStepToActive = () => {
    const op = spec.operations.find((o) => o.id === newOpId);
    if (!op) return;
    updateActive((f) => addStep(f, op.id, `${op.method} ${op.path}`));
  };

  const patchStep = (stepId: string, patch: Partial<FlowStep>) =>
    updateActive((f) => ({
      ...f,
      steps: f.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
    }));

  const onDrop = (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) return;
    updateActive((f) => moveStep(f, dragIdx, toIdx));
    setDragIdx(null);
  };

  const execute = async () => {
    if (!active) return;
    setRunning(true);
    setResults({});
    const { results: rs } = await runFlow(active, execOne, initialVars);
    const map: Record<string, FlowStepResult> = {};
    for (const r of rs) map[r.stepId] = r;
    setResults(map);
    setRunning(false);
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal flow-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>플로우 빌더</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            <CloseCircleIcon size={18} />
          </button>
        </div>
        <div className="modal-body flow-body">
          <div className="flow-bar">
            <Select
              value={activeId ?? ""}
              onChange={setActiveId}
              options={flows.map((f) => ({ value: f.id, label: f.name }))}
              placeholder="플로우 선택"
            />
            <button className="btn small" onClick={createFlow}>
              + 새 플로우
            </button>
            {active && active.steps.length > 0 && (
              <button className="btn small primary" disabled={running} onClick={execute}>
                {running ? "실행 중…" : "▶ 전체 실행"}
              </button>
            )}
          </div>

          {!active ? (
            <div className="hint center">새 플로우를 만들어 시작하세요.</div>
          ) : (
            <>
              <div className="flow-add">
                <Select
                  value={newOpId}
                  onChange={setNewOpId}
                  options={spec.operations.map((o) => ({
                    value: o.id,
                    label: `${o.method} ${o.path}`,
                  }))}
                />
                <button className="btn small" onClick={addStepToActive}>
                  + 단계 추가
                </button>
              </div>
              <div className="hint">
                단계 요청은 스펙 기본값으로 생성되며, 이전 단계에서 추출한 {"{{변수}}"}로 값을 채웁니다.
              </div>
              <div className="flow-steps">
                {active.steps.map((step, idx) => {
                  const r = results[step.id];
                  const op = spec.operations.find((o) => o.id === step.opId);
                  return (
                    <div
                      className="flow-step"
                      key={step.id}
                      draggable
                      onDragStart={() => setDragIdx(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(idx)}
                    >
                      <div className="flow-step-head">
                        <span className="flow-drag">≡</span>
                        <span className="flow-step-num">{idx + 1}</span>
                        {op ? (
                          <span
                            className="method"
                            style={{ color: methodColor(op.method) }}
                          >
                            {op.method}
                          </span>
                        ) : null}
                        <span className="flow-step-path">
                          {op
                            ? op.path
                            : `(없는 operation: ${step.opId})`}
                        </span>
                        {r && (
                          <span
                            className="flow-step-result"
                            style={{
                              color: r.error ? "#f85149" : statusColor(r.status),
                            }}
                          >
                            {r.error ? "ERR" : r.status}
                          </span>
                        )}
                        <button
                          className="icon-btn"
                          onClick={() =>
                            updateActive((f) => removeStep(f, step.id))
                          }
                          title="단계 삭제"
                        >
                          <TrashIcon size={13} />
                        </button>
                      </div>
                      <div className="flow-step-edit">
                        {/* 추출 규칙 */}
                        <div className="flow-sub">추출 (응답→변수)</div>
                        {step.extractRules.map((rule, ri) => (
                          <div className="flow-rule-row" key={ri}>
                            <input
                              className="kv-input"
                              value={rule.varName}
                              placeholder="변수명"
                              onChange={(e) =>
                                patchStep(step.id, {
                                  extractRules: step.extractRules.map((x, j) =>
                                    j === ri ? { ...x, varName: e.target.value } : x,
                                  ),
                                })
                              }
                            />
                            <input
                              className="kv-input"
                              value={rule.path}
                              placeholder="JSONPath"
                              onChange={(e) =>
                                patchStep(step.id, {
                                  extractRules: step.extractRules.map((x, j) =>
                                    j === ri ? { ...x, path: e.target.value } : x,
                                  ),
                                })
                              }
                            />
                            <button
                              className="icon-btn"
                              onClick={() =>
                                patchStep(step.id, {
                                  extractRules: step.extractRules.filter((_, j) => j !== ri),
                                })
                              }
                            >
                              <CloseCircleIcon size={13} />
                            </button>
                          </div>
                        ))}
                        <button
                          className="add-row"
                          onClick={() =>
                            patchStep(step.id, {
                              extractRules: [
                                ...step.extractRules,
                                { varName: "", path: "" } as ExtractRule,
                              ],
                            })
                          }
                        >
                          + 추출 규칙
                        </button>
                        {r && Object.keys(r.extracted).length > 0 && (
                          <div className="flow-extracted">
                            추출됨:{" "}
                            {Object.entries(r.extracted)
                              .map(([k, v]) => `${k}=${v}`)
                              .join(", ")}
                          </div>
                        )}
                        {/* 어서션 */}
                        <div className="flow-sub">어서션</div>
                        {step.assertions.map((a, ai) => (
                          <div className="flow-rule-row" key={ai}>
                            <Select
                              value={a.kind}
                              onChange={(v) =>
                                patchStep(step.id, {
                                  assertions: step.assertions.map((x, j) =>
                                    j === ai
                                      ? { ...x, kind: v as Assertion["kind"] }
                                      : x,
                                  ),
                                })
                              }
                              options={[
                                { value: "status", label: "status" },
                                { value: "jsonpath", label: "jsonpath" },
                              ]}
                            />
                            {a.kind === "jsonpath" && (
                              <input
                                className="kv-input"
                                value={a.path ?? ""}
                                placeholder="JSONPath"
                                onChange={(e) =>
                                  patchStep(step.id, {
                                    assertions: step.assertions.map((x, j) =>
                                      j === ai ? { ...x, path: e.target.value } : x,
                                    ),
                                  })
                                }
                              />
                            )}
                            <Select
                              value={a.op}
                              onChange={(v) =>
                                patchStep(step.id, {
                                  assertions: step.assertions.map((x, j) =>
                                    j === ai
                                      ? { ...x, op: v as Assertion["op"] }
                                      : x,
                                  ),
                                })
                              }
                              options={[
                                { value: "equals", label: "=" },
                                { value: "contains", label: "포함" },
                                { value: "exists", label: "존재" },
                              ]}
                            />
                            {a.op !== "exists" && (
                              <input
                                className="kv-input"
                                value={a.expected ?? ""}
                                placeholder="기대값"
                                onChange={(e) =>
                                  patchStep(step.id, {
                                    assertions: step.assertions.map((x, j) =>
                                      j === ai
                                        ? { ...x, expected: e.target.value }
                                        : x,
                                    ),
                                  })
                                }
                              />
                            )}
                            <button
                              className="icon-btn"
                              onClick={() =>
                                patchStep(step.id, {
                                  assertions: step.assertions.filter((_, j) => j !== ai),
                                })
                              }
                            >
                              <CloseCircleIcon size={13} />
                            </button>
                          </div>
                        ))}
                        <button
                          className="add-row"
                          onClick={() =>
                            patchStep(step.id, {
                              assertions: [
                                ...step.assertions,
                                {
                                  kind: "status",
                                  op: "equals",
                                  expected: "200",
                                } as Assertion,
                              ],
                            })
                          }
                        >
                          + 어서션
                        </button>
                        {r && r.assertResults.length > 0 && (
                          <div className="flow-asserts">
                            {r.assertResults.map((ar, j) => (
                              <span
                                key={j}
                                className={ar.ok ? "flow-assert-ok" : "flow-assert-bad"}
                                title={ar.detail}
                              >
                                {ar.ok ? "✅" : "❌"} {ar.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
