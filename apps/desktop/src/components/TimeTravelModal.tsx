// API 시간여행: 대상 API를 수동/자동주기로 스냅샷 저장, 타임라인 탐색·비교.
import { useEffect, useMemo, useState } from "react";
import type { ParsedSpec } from "../core/types";
import {
  loadTTConfig, saveTTConfig, groupByOp, type Snapshot, type TimeTravelConfig,
} from "../core/snapshots";
import { Select } from "./Select";
import { methodColor, statusColor } from "./method";
import { CloseCircleIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";

interface Props {
  specUrl: string;
  spec: ParsedSpec;
  snapshots: Snapshot[];
  onCapture: (opIds: string[]) => void;
  onCompare: (a: Snapshot, b: Snapshot) => void;
  onClose: () => void;
}

const INTERVAL_OPTS = [
  { value: "1", label: "1분" }, { value: "5", label: "5분" },
  { value: "15", label: "15분" }, { value: "30", label: "30분" },
];

export function TimeTravelModal({ specUrl, spec, snapshots, onCapture, onCompare, onClose }: Props) {
  useEscToClose(onClose);
  const [config, setConfig] = useState<TimeTravelConfig>(() => loadTTConfig(specUrl));
  const [selectedOp, setSelectedOp] = useState<string | null>(null);
  const [compareSel, setCompareSel] = useState<string[]>([]); // snapshot ids (max 2)
  // 응답 보기: alert 금지 — 인라인 pre로 표시
  const [viewSnap, setViewSnap] = useState<Snapshot | null>(null);

  useEffect(() => { saveTTConfig(specUrl, config); }, [specUrl, config]);

  const grouped = useMemo(() => groupByOp(snapshots), [snapshots]);
  const toggleTarget = (opId: string) =>
    setConfig((c) => ({ ...c, opIds: c.opIds.includes(opId) ? c.opIds.filter((x) => x !== opId) : [...c.opIds, opId] }));

  const toggleCompare = (id: string) =>
    setCompareSel((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev.slice(-1), id].slice(-2));

  const doCompare = () => {
    if (compareSel.length !== 2) return;
    const a = snapshots.find((s) => s.id === compareSel[0]);
    const b = snapshots.find((s) => s.id === compareSel[1]);
    if (a && b) onCompare(a, b);
  };

  const timelineOp = selectedOp ?? config.opIds[0] ?? spec.operations[0]?.id ?? null;
  const timeline = timelineOp ? (grouped.get(timelineOp) ?? []) : [];

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal tt-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>API 시간여행</h3>
          <button className="icon-btn" onClick={onClose} title="닫기"><CloseCircleIcon size={18} /></button>
        </div>
        <div className="modal-body tt-body">
          <div className="tt-control">
            <button className="btn small primary" disabled={config.opIds.length === 0} onClick={() => onCapture(config.opIds)}>
              📸 지금 스냅샷
            </button>
            <label className="tt-auto">
              <input type="checkbox" checked={config.autoOn} onChange={(e) => setConfig((c) => ({ ...c, autoOn: e.target.checked }))} disabled={config.opIds.length === 0} />
              자동
            </label>
            <Select value={String(config.intervalMin)} onChange={(v) => setConfig((c) => ({ ...c, intervalMin: Number(v) }))} options={INTERVAL_OPTS} />
            {config.autoOn && <span className="tt-auto-on">자동 캡처 중 (앱 열린 동안)</span>}
          </div>
          <div className="tt-targets">
            <div className="tt-section">대상 API</div>
            {spec.operations.map((o) => (
              <label className="tt-target-check" key={o.id}>
                <input type="checkbox" aria-label={`${o.id} 대상`} checked={config.opIds.includes(o.id)} onChange={() => toggleTarget(o.id)} />
                <span className="method" style={{ color: methodColor(o.method) }}>{o.method}</span>
                <span className="tt-path">{o.path}</span>
              </label>
            ))}
          </div>
          <div className="tt-timeline-head">
            <span className="tt-section">타임라인</span>
            <Select value={timelineOp ?? ""} onChange={(v) => setSelectedOp(v)} options={spec.operations.map((o) => ({ value: o.id, label: `${o.method} ${o.path}` }))} />
            <button className="btn small" disabled={compareSel.length !== 2} onClick={doCompare}>비교 ({compareSel.length}/2)</button>
          </div>
          <div className="tt-timeline">
            {timeline.length === 0 && <div className="hint">기록 없음 — 대상으로 체크하고 스냅샷을 찍으세요</div>}
            {[...timeline].reverse().map((s) => (
              <div className="tt-snap-row" key={s.id}>
                <input type="checkbox" aria-label="비교 선택" checked={compareSel.includes(s.id)} onChange={() => toggleCompare(s.id)} />
                <span className="tt-snap-time">{new Date(s.at).toLocaleString()}</span>
                <span className="tt-snap-status" style={{ color: statusColor(s.status) }}>{s.status || "ERR"}</span>
                <span className="tt-snap-dur">{s.durationMs}ms</span>
                <button
                  className="btn small"
                  onClick={() => setViewSnap((prev) => prev?.id === s.id ? null : s)}
                >
                  응답
                </button>
              </div>
            ))}
          </div>
          {viewSnap && (
            <pre className="tt-body-view">{viewSnap.body}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
