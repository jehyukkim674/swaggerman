// API 성능 추이: 히스토리 기반 operation별 응답시간 통계·스파크라인·추이.
import { useMemo, useState } from "react";
import type { HistoryItem } from "../core/history";
import { computePerfTrends, type PerfStat, type PerfTrend } from "../core/perf-trend";
import { Sparkline } from "./Sparkline";
import { methodColor } from "./method";
import { CloseCircleIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";

interface Props {
  history: HistoryItem[];
  onClose: () => void;
}

const TREND_META: Record<PerfTrend, { label: string; color: string }> = {
  slower: { label: "⚠️ 느려지는 중", color: "#f85149" },
  faster: { label: "✅ 빨라짐", color: "#3fb950" },
  stable: { label: "— 안정", color: "var(--muted)" },
  insufficient: { label: "—", color: "var(--muted)" },
};

type SortKey = "avgMs" | "p95Ms" | "count";

export function PerfModal({ history, onClose }: Props) {
  useEscToClose(onClose);
  const [sortKey, setSortKey] = useState<SortKey>("avgMs");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const stats = useMemo(() => {
    const base = computePerfTrends(history);
    return [...base].sort((a, b) =>
      sortDir === "desc" ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]
    );
  }, [history, sortKey, sortDir]);

  const trendColor = (t: PerfTrend) => TREND_META[t].color;

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === "desc" ? " ▼" : " ▲") : "";

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal perf-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>API 성능 추이</h3>
          <button className="icon-btn" onClick={onClose} title="닫기"><CloseCircleIcon size={18} /></button>
        </div>
        <div className="modal-body perf-body">
          {stats.length === 0 ? (
            <div className="hint center">기록이 없습니다. 요청을 보내면 응답시간이 집계됩니다.</div>
          ) : (
            <table className="perf-table">
              <thead>
                <tr>
                  <th>API</th>
                  <th className={`perf-sortable${sortKey === "count" ? " perf-sort-active" : ""}`} onClick={() => toggleSort("count")}>호출{sortIndicator("count")}</th>
                  <th className={`perf-sortable${sortKey === "avgMs" ? " perf-sort-active" : ""}`} onClick={() => toggleSort("avgMs")}>평균{sortIndicator("avgMs")}</th>
                  <th className={`perf-sortable${sortKey === "p95Ms" ? " perf-sort-active" : ""}`} onClick={() => toggleSort("p95Ms")}>p95{sortIndicator("p95Ms")}</th>
                  <th>추이</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s: PerfStat) => (
                  <tr key={s.opId}>
                    <td className="perf-op">
                      <span className="method" style={{ color: methodColor(s.method) }}>{s.method}</span> {s.path}
                    </td>
                    <td>{s.count}</td>
                    <td>{s.avgMs}ms</td>
                    <td>{s.p95Ms}ms</td>
                    <td className="perf-trend-cell">
                      <Sparkline values={s.series} color={trendColor(s.trend)} />
                      <span style={{ color: TREND_META[s.trend].color }}>{TREND_META[s.trend].label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
