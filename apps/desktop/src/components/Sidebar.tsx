import { useMemo, useState } from "react";
import type { HTTPMethod, ParsedOperation, ParsedSpec } from "../core/types";
import { methodColor, statusColor } from "./method";
import { relativeTime, type HistoryItem } from "../core/history";
import { ReplayIcon, TrashIcon } from "./icons";
import { Select } from "./Select";
import { STATUS_META, type NotesMap } from "../core/notes";

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
  selectedHistoryId: string | null;
  /** 히스토리 2건 비교 요청(비교 모달 열기). */
  onCompareHistory: (a: HistoryItem, b: HistoryItem) => void;
  /** opId별 메모/상태 (상태 점·메모 아이콘 표시용) */
  notes: NotesMap;
}

const FILTER_METHODS: HTTPMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH"];

export function Sidebar(props: Props) {
  const { spec, loading, error, selectedId, onSelect } = props;
  const [tab, setTab] = useState<"api" | "history">("api");
  const [search, setSearch] = useState("");
  const [methods, setMethods] = useState<Set<HTTPMethod>>(new Set());
  const [selectedTag, setSelectedTag] = useState<string>("");

  const favSet = useMemo(() => new Set(props.favorites), [props.favorites]);

  const availableTags = useMemo(() => {
    if (!spec) return [];
    const seen = new Set<string>();
    for (const op of spec.operations) seen.add(op.tags[0] ?? "default");
    return [...seen].sort();
  }, [spec]);

  // 태그별 오퍼레이션 개수 (태그 드롭다운의 오른쪽 힌트로 표시)
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!spec) return counts;
    for (const op of spec.operations) {
      const tag = op.tags[0] ?? "default";
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return counts;
  }, [spec]);

  const filtered = useMemo(() => {
    if (!spec) return [];
    const term = search.trim().toLowerCase();
    return spec.operations.filter((op) => {
      const matchMethod = methods.size === 0 || methods.has(op.method);
      const matchTag = !selectedTag || (op.tags[0] ?? "default") === selectedTag;
      const matchSearch =
        !term ||
        op.path.toLowerCase().includes(term) ||
        (op.summary ?? "").toLowerCase().includes(term);
      return matchMethod && matchTag && matchSearch;
    });
  }, [spec, search, methods, selectedTag]);

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

  const renderRow = (op: ParsedOperation) => {
    const note = props.notes[op.id];
    return (
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
          <span className="op-path">
            {note && note.status !== "none" && (
              <span
                className="op-status-dot"
                style={{ background: STATUS_META[note.status].dot }}
                title={STATUS_META[note.status].label}
              />
            )}
            {op.path}
            {note?.text.trim() && (
              <span className="op-note-icon" title="메모 있음">📝</span>
            )}
          </span>
          {op.summary && <span className="op-summary">{op.summary}</span>}
        </span>
      </div>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs">
        <button className={tab === "api" ? "active" : ""} onClick={() => setTab("api")}>
          API
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          히스토리
          {props.history.length > 0 && (
            <span className="tab-badge">{props.history.length}</span>
          )}
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
          {availableTags.length > 0 && (
            <Select
              className="tag-select"
              value={selectedTag}
              onChange={setSelectedTag}
              searchable
              searchPlaceholder="태그 검색…"
              options={[
                {
                  value: "",
                  label: `전체 태그 (${availableTags.length})`,
                  hint: `${spec?.operations.length ?? 0}개`,
                },
                ...availableTags.map((t) => ({
                  value: t,
                  label: t,
                  hint: `${tagCounts.get(t) ?? 0}개`,
                })),
              ]}
            />
          )}

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
          selectedId={props.selectedHistoryId}
          onSelect={props.onSelectHistory}
          onReplay={props.onReplayHistory}
          onDelete={props.onDeleteHistory}
          onClear={props.onClearHistory}
          onCompare={props.onCompareHistory}
        />
      )}
    </aside>
  );
}

function HistoryTab({
  history,
  selectedId,
  onSelect,
  onReplay,
  onDelete,
  onClear,
  onCompare,
}: {
  history: HistoryItem[];
  selectedId: string | null;
  onSelect: (item: HistoryItem) => void;
  onReplay: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onCompare: (a: HistoryItem, b: HistoryItem) => void;
}) {
  // 비교 선택(최대 2개, 3번째 선택 시 가장 오래된 선택 해제)
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev.slice(-1), id].slice(-2),
    );
  };
  const compareReady = compareIds.length === 2;
  const startCompare = () => {
    const a = history.find((h) => h.id === compareIds[0]);
    const b = history.find((h) => h.id === compareIds[1]);
    if (a && b) onCompare(a, b);
  };
  if (history.length === 0) {
    return <div className="hint center">요청을 보내면 여기에 기록됩니다.</div>;
  }
  return (
    <div className="history-tab">
      <div className="history-head">
        <span className="muted">{history.length}개 요청</span>
        <button
          className={compareReady ? "btn small primary" : "btn small"}
          disabled={!compareReady}
          onClick={startCompare}
          title="체크박스로 두 항목을 선택하면 요청·응답 차이를 비교합니다"
        >
          비교 ({compareIds.length}/2)
        </button>
        <button className="link-danger" onClick={onClear}>
          전체 삭제
        </button>
      </div>
      <div className="op-list">
        {history.map((item) => (
          <div
            key={item.id}
            className={`hist-row${item.id === selectedId ? " selected" : ""}`}
            onClick={() => onSelect(item)}
          >
            <input
              type="checkbox"
              className="hist-compare-check"
              checked={compareIds.includes(item.id)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggleCompare(item.id)}
              title="비교 대상으로 선택(2개 선택 시 비교 가능)"
            />
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
                <ReplayIcon size={14} />
              </button>
              <button
                className="danger"
                title="삭제"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
              >
                <TrashIcon size={14} />
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
