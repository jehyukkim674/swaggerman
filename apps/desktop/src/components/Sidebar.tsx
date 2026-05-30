import { useMemo, useState } from "react";
import type { HTTPMethod, ParsedOperation, ParsedSpec } from "../core/types";
import { methodColor, statusColor } from "./method";
import { relativeTime, type HistoryItem } from "../core/history";

interface Props {
  spec: ParsedSpec | null;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (op: ParsedOperation) => void;
  favorites: string[];
  onToggleFavorite: (opId: string) => void;
  history: HistoryItem[];
  onSelectHistory: (item: HistoryItem) => void;
  onReplayHistory: (item: HistoryItem) => void;
  onDeleteHistory: (id: string) => void;
  onClearHistory: () => void;
}

const FILTER_METHODS: HTTPMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH"];

export function Sidebar(props: Props) {
  const { spec, loading, error, selectedId, onSelect } = props;
  const [tab, setTab] = useState<"api" | "history">("api");
  const [search, setSearch] = useState("");
  const [methods, setMethods] = useState<Set<HTTPMethod>>(new Set());

  const favSet = useMemo(() => new Set(props.favorites), [props.favorites]);

  const filtered = useMemo(() => {
    if (!spec) return [];
    const term = search.trim().toLowerCase();
    return spec.operations.filter((op) => {
      const matchMethod = methods.size === 0 || methods.has(op.method);
      const matchSearch =
        !term ||
        op.path.toLowerCase().includes(term) ||
        (op.summary ?? "").toLowerCase().includes(term);
      return matchMethod && matchSearch;
    });
  }, [spec, search, methods]);

  const favoriteOps = useMemo(
    () => filtered.filter((op) => favSet.has(op.id)),
    [filtered, favSet],
  );

  const groups = useMemo(() => {
    const map = new Map<string, ParsedOperation[]>();
    for (const op of filtered) {
      const tag = op.tags[0] ?? "default";
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag)!.push(op);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  function toggleMethod(method: HTTPMethod) {
    setMethods((prev) => {
      const next = new Set(prev);
      if (next.has(method)) next.delete(method);
      else next.add(method);
      return next;
    });
  }

  const renderRow = (op: ParsedOperation) => (
    <div
      key={op.id}
      className={`op-row${op.id === selectedId ? " selected" : ""}`}
      onClick={() => onSelect(op)}
    >
      <button
        className="star"
        onClick={(e) => {
          e.stopPropagation();
          props.onToggleFavorite(op.id);
        }}
        title={favSet.has(op.id) ? "즐겨찾기 제거" : "즐겨찾기 추가"}
      >
        <span style={{ color: favSet.has(op.id) ? "#d29922" : "#555" }}>
          {favSet.has(op.id) ? "★" : "☆"}
        </span>
      </button>
      <span className="method" style={{ color: methodColor(op.method) }}>
        {op.method}
      </span>
      <span className="op-text">
        <span className="op-path">{op.path}</span>
        {op.summary && <span className="op-summary">{op.summary}</span>}
      </span>
    </div>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs">
        <button className={tab === "api" ? "active" : ""} onClick={() => setTab("api")}>
          API
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          히스토리{props.history.length > 0 ? ` ${props.history.length}` : ""}
        </button>
      </div>

      {tab === "api" ? (
        <>
          <input
            className="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="검색…"
            spellCheck={false}
          />
          <div className="method-filter">
            {FILTER_METHODS.map((m) => (
              <button
                key={m}
                className={`method-pill${methods.has(m) ? " on" : ""}`}
                style={
                  methods.has(m)
                    ? { background: methodColor(m), color: "#fff", borderColor: methodColor(m) }
                    : { color: methodColor(m) }
                }
                onClick={() => toggleMethod(m)}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="op-list">
            {loading && <div className="hint">로딩 중…</div>}
            {error && <div className="error-box">{error}</div>}
            {!loading && !error && !spec && (
              <div className="hint">spec URL을 입력하고 Load 하세요.</div>
            )}
            {favoriteOps.length > 0 && (
              <section>
                <div className="tag-header fav">★ 즐겨찾기</div>
                {favoriteOps.map(renderRow)}
              </section>
            )}
            {groups.map(([tagName, ops]) => (
              <section key={tagName}>
                <div className="tag-header">{tagName}</div>
                {ops.map(renderRow)}
              </section>
            ))}
          </div>
        </>
      ) : (
        <HistoryTab
          history={props.history}
          onSelect={props.onSelectHistory}
          onReplay={props.onReplayHistory}
          onDelete={props.onDeleteHistory}
          onClear={props.onClearHistory}
        />
      )}
    </aside>
  );
}

function HistoryTab({
  history,
  onSelect,
  onReplay,
  onDelete,
  onClear,
}: {
  history: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onReplay: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  if (history.length === 0) {
    return <div className="hint center">요청을 보내면 여기에 기록됩니다.</div>;
  }
  return (
    <div className="history-tab">
      <div className="history-head">
        <span className="muted">{history.length}개 요청</span>
        <button className="link-danger" onClick={onClear}>
          전체 삭제
        </button>
      </div>
      <div className="op-list">
        {history.map((item) => (
          <div key={item.id} className="hist-row" onClick={() => onSelect(item)}>
            <span className="method" style={{ color: methodColor(item.method) }}>
              {item.method}
            </span>
            <span className="op-text">
              <span className="op-path">{item.path}</span>
              <span className="op-summary">{relativeTime(item.executedAt)}</span>
            </span>
            <span className="hist-status" style={{ color: statusColor(item.status) }}>
              {item.status}
            </span>
            <span className="hist-actions">
              <button
                title="다시 실행"
                onClick={(e) => {
                  e.stopPropagation();
                  onReplay(item);
                }}
              >
                ↻
              </button>
              <button
                title="삭제"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
              >
                🗑
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
