import { useState } from "react";
import type { Collection, SavedRequest } from "../core/collections";
import { methodColor, statusColor } from "./method";
import { CloseCircleIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";

export interface RunResult {
  status: number;
  ok: boolean;
  durationMs: number;
  error?: string;
}

interface RowState extends Partial<RunResult> {
  running?: boolean;
  done?: boolean;
}

interface Props {
  collections: Collection[];
  onRun: (req: SavedRequest) => Promise<RunResult>;
  onClose: () => void;
}

/** 컬렉션 일괄 실행 + 통과/실패 리포트. */
export function RunnerModal({ collections, onRun, onClose }: Props) {
  // ESC 키로 닫기
  useEscToClose(onClose);

  const [colId, setColId] = useState(collections[0]?.id ?? "");
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const col = collections.find((c) => c.id === colId);

  const run = async () => {
    if (!col) return;
    setRunning(true);
    setRows({});
    for (const req of col.requests) {
      setRows((p) => ({ ...p, [req.id]: { running: true } }));
      const result = await onRun(req);
      setRows((p) => ({ ...p, [req.id]: { ...result, running: false, done: true } }));
    }
    setRunning(false);
  };

  const results = col?.requests.map((r) => rows[r.id]).filter((s) => s?.done) ?? [];
  const passed = results.filter((s) => s?.ok).length;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal runner-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>컬렉션 러너</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            <CloseCircleIcon size={18} />
          </button>
        </div>

        <div className="modal-body">
          {collections.length === 0 && (
            <div className="hint">
              저장된 컬렉션이 없습니다. 요청 화면에서 “컬렉션 → 현재 요청 저장”으로 컬렉션을 만든 뒤,
              여기서 일괄 실행(각 요청의 status·통과/실패·소요시간 리포트)할 수 있습니다.
            </div>
          )}
          <div className="runner-bar">
            <select value={colId} onChange={(e) => setColId(e.target.value)} disabled={running}>
              {collections.length === 0 && <option value="">컬렉션 없음</option>}
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.requests.length})
                </option>
              ))}
            </select>
            <button
              className="btn small primary"
              onClick={run}
              disabled={running || !col || col.requests.length === 0}
            >
              {running ? "실행 중…" : "실행"}
            </button>
            {results.length > 0 && (
              <span
                className={passed === results.length ? "test-badge pass" : "test-badge fail"}
              >
                {passed}/{results.length} 통과
              </span>
            )}
          </div>

          {col?.requests.map((req) => {
            const st = rows[req.id];
            return (
              <div className="runner-row" key={req.id}>
                <span className="method-mini" style={{ color: methodColor(req.method) }}>
                  {req.method}
                </span>
                <span className="runner-name" title={req.url}>
                  {req.name}
                </span>
                {st?.running && <span className="muted">…</span>}
                {st?.done && st.error && <span className="assert-bad" title={st.error}>오류</span>}
                {st?.done && !st.error && (
                  <>
                    <span style={{ color: statusColor(st.status ?? 0) }}>{st.status}</span>
                    <span className="muted">{st.durationMs}ms</span>
                    <span className={st.ok ? "assert-ok" : "assert-bad"}>{st.ok ? "✓" : "✕"}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
