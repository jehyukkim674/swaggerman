// 권한 매트릭스: 페르소나(토큰)별로 선택한 API를 호출해 상태코드 표를 만든다.
import { useEffect, useMemo, useState } from "react";
import type { ParsedOperation } from "../core/types";
import {
  loadPersonas,
  savePersonas,
  defaultPersonas,
  runMatrix,
  newId,
  type Persona,
  type MatrixCell,
  type MatrixResult,
} from "../core/permission-matrix";
import { methodColor } from "./method";
import { CloseCircleIcon, TrashIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";
import { ConfirmDialog } from "./ConfirmDialog";

interface Props {
  specUrl: string;
  operations: ParsedOperation[];
  /** (opId, token) → 셀. App.tsx가 주입(실제 요청 실행) */
  runOne: (opId: string, token: string) => Promise<MatrixCell>;
  onClose: () => void;
}

export function PermissionMatrixModal({ specUrl, operations, runOne, onClose }: Props) {
  useEscToClose(onClose);

  const [personas, setPersonas] = useState<Persona[]>(() => {
    const loaded = loadPersonas(specUrl);
    return loaded.length > 0 ? loaded : defaultPersonas();
  });

  // GET만 기본 체크
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(operations.filter((o) => o.method === "GET").map((o) => o.id)),
  );
  const [result, setResult] = useState<MatrixResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [confirmWrite, setConfirmWrite] = useState(false);

  // 페르소나 변경 시 자동 저장
  useEffect(() => {
    savePersonas(specUrl, personas);
  }, [specUrl, personas]);

  const checkedOps = useMemo(
    () => operations.filter((o) => checked.has(o.id)),
    [operations, checked],
  );
  const writeCount = useMemo(
    () => checkedOps.filter((o) => o.method !== "GET").length,
    [checkedOps],
  );

  const patchPersona = (id: string, p: Partial<Persona>) =>
    setPersonas((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));

  // 페르소나 추가: newId()로 id 전략을 permission-matrix.ts와 통일
  const addPersona = () =>
    setPersonas((prev) => [...prev, { id: newId(), name: "새 역할", token: "" }]);

  const removePersona = (id: string) => setPersonas((prev) => prev.filter((x) => x.id !== id));

  const toggleOp = (opId: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(opId)) next.delete(opId);
      else next.add(opId);
      return next;
    });

  const doRun = async () => {
    setRunning(true);
    setResult(null);
    setProgress({ done: 0, total: checkedOps.length * personas.length });
    const res = await runMatrix(
      personas,
      checkedOps.map((o) => o.id),
      runOne,
      (done, total) => setProgress({ done, total }),
    );
    setResult(res);
    setRunning(false);
  };

  const onRunClick = () => {
    if (writeCount > 0) setConfirmWrite(true);
    else void doRun();
  };

  const canRun = checkedOps.length > 0 && personas.length > 0 && !running;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal pmatrix-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>권한 매트릭스</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            <CloseCircleIcon size={18} />
          </button>
        </div>
        <div className="modal-body pmatrix-body">
          {/* 페르소나 편집 */}
          <div className="pmatrix-personas">
            <div className="pmatrix-section-title">페르소나 (토큰)</div>
            {personas.map((p) => (
              <div className="pmatrix-persona-row" key={p.id}>
                <input
                  className="kv-input pmatrix-persona-name"
                  value={p.name}
                  onChange={(e) => patchPersona(p.id, { name: e.target.value })}
                  placeholder="역할 이름"
                  spellCheck={false}
                />
                <input
                  className="kv-input pmatrix-persona-token"
                  value={p.token}
                  onChange={(e) => patchPersona(p.id, { token: e.target.value })}
                  placeholder="토큰 (Bearer 자동)"
                  spellCheck={false}
                  type="password"
                />
                <button className="icon-btn" onClick={() => removePersona(p.id)} title="삭제">
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
            <button className="add-row" onClick={addPersona}>+ 페르소나 추가</button>
          </div>

          {/* API 선택 */}
          <div className="pmatrix-ops">
            <div className="pmatrix-section-title">
              대상 API ({checkedOps.length})
              {writeCount > 0 && (
                <span className="pmatrix-warn-inline"> ⚠️ 쓰기 {writeCount}건</span>
              )}
            </div>
            <div className="pmatrix-op-list">
              {operations.map((op) => (
                <label className="pmatrix-op-check" key={op.id}>
                  <input
                    type="checkbox"
                    data-opid={op.id}
                    checked={checked.has(op.id)}
                    onChange={() => toggleOp(op.id)}
                  />
                  <span className="method" style={{ color: methodColor(op.method) }}>
                    {op.method}
                  </span>
                  <span className="pmatrix-op-path">{op.path}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 실행 */}
          <div className="pmatrix-actions">
            <button className="btn small primary" disabled={!canRun} onClick={onRunClick}>
              {running
                ? `실행 중… (${progress.done}/${progress.total})`
                : "실행"}
            </button>
          </div>

          {/* 결과 표 (Task 4에서 구현) */}
          {result && <MatrixTable personas={personas} ops={checkedOps} result={result} />}
        </div>
      </div>

      {confirmWrite && (
        <ConfirmDialog
          title="쓰기 요청 포함"
          message={`선택한 API 중 쓰기 요청(GET 외) ${writeCount}건이 실제 서버에 전송됩니다. 실제 데이터가 변경될 수 있습니다. 계속할까요?`}
          confirmLabel="실행"
          onConfirm={() => {
            setConfirmWrite(false);
            void doRun();
          }}
          onCancel={() => setConfirmWrite(false)}
        />
      )}
    </div>
  );
}

// 결과 표는 Task 4에서 구현. 우선 stub.
function MatrixTable(_props: { personas: Persona[]; ops: ParsedOperation[]; result: MatrixResult }) {
  return <div className="hint">결과 표는 다음 단계에서 구현됩니다.</div>;
}
