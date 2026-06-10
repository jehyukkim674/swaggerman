import { useState } from "react";
import type { Collection, SavedRequest } from "../core/collections";
import { methodColor, statusColor } from "./method";
import { CloseCircleIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";
import { Select } from "./Select";

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
  const [iterations, setIterations] = useState(1);
  // 누적 통과/전체 — 반복 실행 시 행(rows)은 최신 결과만 보여서 별도 집계
  const [summary, setSummary] = useState<{ passed: number; total: number } | null>(null);

  const col = collections.find((c) => c.id === colId);

  const run = async () => {
    if (!col || running) return;
    setRunning(true);
    setRows({});
    setSummary(null);
    let passed = 0;
    let total = 0;
    try {
      const n = Math.max(1, Math.floor(iterations) || 1);
      for (let i = 0; i < n; i++) {
        for (const req of col.requests) {
          setRows((p) => ({ ...p, [req.id]: { running: true } }));
          let result: RunResult;
          try {
            result = await onRun(req);
          } catch (e) {
            // 한 요청의 실패가 나머지 실행을 막지 않도록 행 단위로 흡수
            result = { status: 0, ok: false, durationMs: 0, error: String(e) };
          }
          total += 1;
          if (result.ok) passed += 1;
          setRows((p) => ({ ...p, [req.id]: { ...result, running: false, done: true } }));
          setSummary({ passed, total });
        }
      }
    } finally {
      setRunning(false);
    }
  };

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
            <Select
              value={colId}
              onChange={setColId}
              disabled={running}
              placeholder="컬렉션 없음"
              options={collections.map((c) => ({
                value: c.id,
                label: c.name,
                hint: `${c.requests.length}개`,
              }))}
            />
            <input
              className="kv-input"
              type="number"
              min={1}
              value={iterations}
              onChange={(e) => setIterations(Number(e.target.value))}
              disabled={running}
              title="반복 횟수 — 컬렉션 전체를 N회 연속 실행"
              aria-label="반복 횟수"
              style={{ width: 56, flex: "0 0 auto" }}
            />
            <button
              className="btn small primary"
              onClick={run}
              disabled={running || !col || col.requests.length === 0}
            >
              {running ? "실행 중…" : "실행"}
            </button>
            {summary && (
              <span
                className={summary.passed === summary.total ? "test-badge pass" : "test-badge fail"}
              >
                {summary.passed}/{summary.total} 통과
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
