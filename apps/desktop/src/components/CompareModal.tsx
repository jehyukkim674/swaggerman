import { useMemo } from "react";
import type { HistoryItem } from "../core/history";
import type { RequestParam } from "../core/request-builder";
import { diffLines, diffRecords, type FieldDiff } from "../core/diff";
import { methodColor, statusColor } from "./method";
import { CloseCircleIcon } from "./icons";
import { relativeTime } from "../core/history";

interface Props {
  a: HistoryItem;
  b: HistoryItem;
  onClose: () => void;
}

/** RequestParam[] → enabled 항목만 Record로. */
function paramsToRecord(params: RequestParam[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of params) if (p.enabled && p.key) out[p.key] = p.value;
  return out;
}

function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function FieldDiffTable({ title, diffs }: { title: string; diffs: FieldDiff[] }) {
  if (diffs.length === 0) return null;
  const changed = diffs.filter((d) => d.status !== "same");
  return (
    <div className="cmp-section">
      <div className="cmp-section-title">
        {title}
        {changed.length === 0 && <span className="cmp-same-badge">동일</span>}
      </div>
      <table className="cmp-table">
        <thead>
          <tr>
            <th>키</th>
            <th>A</th>
            <th>B</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map((d) => (
            <tr key={d.key} className={`cmp-${d.status}`}>
              <td>{d.key}</td>
              <td>{d.a ?? <em className="cmp-none">없음</em>}</td>
              <td>{d.b ?? <em className="cmp-none">없음</em>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineDiffView({ title, a, b }: { title: string; a: string; b: string }) {
  const ops = useMemo(() => diffLines(a, b), [a, b]);
  const hasChange = ops.some((o) => o.type !== "equal");
  return (
    <div className="cmp-section">
      <div className="cmp-section-title">
        {title}
        {!hasChange && <span className="cmp-same-badge">동일</span>}
      </div>
      {hasChange && (
        <pre className="cmp-diff">
          {ops.map((op, i) => (
            <div key={i} className={`cmp-line cmp-line-${op.type}`}>
              <span className="cmp-line-sign">{op.type === "add" ? "+" : op.type === "remove" ? "-" : " "}</span>
              {op.text}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

/** 히스토리 2건의 요청·응답 차이 비교 모달. */
export function CompareModal({ a, b, onClose }: Props) {
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal compare-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>히스토리 비교</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            <CloseCircleIcon size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* 메타 */}
          <table className="cmp-table cmp-meta">
            <thead>
              <tr>
                <th></th>
                <th>A</th>
                <th>B</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>요청</td>
                <td>
                  <span className="method-mini" style={{ color: methodColor(a.method) }}>{a.method}</span> {a.path}
                </td>
                <td>
                  <span className="method-mini" style={{ color: methodColor(b.method) }}>{b.method}</span> {b.path}
                </td>
              </tr>
              <tr>
                <td>URL</td>
                <td className="cmp-url">{a.url}</td>
                <td className="cmp-url">{b.url}</td>
              </tr>
              <tr>
                <td>상태</td>
                <td style={{ color: statusColor(a.status) }}>{a.status}</td>
                <td style={{ color: statusColor(b.status) }}>{b.status}</td>
              </tr>
              <tr>
                <td>실행</td>
                <td>{relativeTime(a.executedAt)} · {a.durationMs}ms</td>
                <td>{relativeTime(b.executedAt)} · {b.durationMs}ms</td>
              </tr>
            </tbody>
          </table>

          {/* 요청 diff */}
          <FieldDiffTable title="Path 파라미터" diffs={diffRecords(a.inputs.pathParams, b.inputs.pathParams)} />
          <FieldDiffTable
            title="Query 파라미터"
            diffs={diffRecords(paramsToRecord(a.inputs.queryParams), paramsToRecord(b.inputs.queryParams))}
          />
          <FieldDiffTable
            title="Headers"
            diffs={diffRecords(paramsToRecord(a.inputs.headers), paramsToRecord(b.inputs.headers))}
          />
          {(a.inputs.body || b.inputs.body) && (
            <LineDiffView title="요청 Body" a={pretty(a.inputs.body)} b={pretty(b.inputs.body)} />
          )}

          {/* 응답 diff */}
          <LineDiffView title="응답 Body" a={pretty(a.responseBody)} b={pretty(b.responseBody)} />
        </div>

        <div className="modal-foot">
          <div className="hint" style={{ marginRight: "auto" }}>
            <span className="cmp-legend cmp-line-remove">- A에만 있음</span>
            <span className="cmp-legend cmp-line-add">+ B에만 있음</span>
          </div>
          <button className="btn" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
