import { useMemo, useState } from "react";
import type { ParsedOperation, ParsedSpec } from "../core/types";
import { methodColor } from "./method";

interface Props {
  spec: ParsedSpec | null;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (op: ParsedOperation) => void;
}

export function Sidebar({ spec, loading, error, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");

  const groups = useMemo(() => {
    if (!spec) return [];
    const term = search.trim().toLowerCase();
    const filtered = spec.operations.filter(
      (op) =>
        !term ||
        op.path.toLowerCase().includes(term) ||
        (op.summary ?? "").toLowerCase().includes(term),
    );
    const map = new Map<string, ParsedOperation[]>();
    for (const op of filtered) {
      const tag = op.tags[0] ?? "default";
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag)!.push(op);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [spec, search]);

  return (
    <aside className="sidebar">
      <input
        className="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="검색…"
        spellCheck={false}
      />
      <div className="op-list">
        {loading && <div className="hint">로딩 중…</div>}
        {error && <div className="error-box">{error}</div>}
        {!loading && !error && !spec && <div className="hint">spec URL을 입력하고 Load 하세요.</div>}
        {groups.map(([tag, ops]) => (
          <section key={tag}>
            <div className="tag-header">{tag}</div>
            {ops.map((op) => (
              <button
                key={op.id}
                className={`op-row${op.id === selectedId ? " selected" : ""}`}
                onClick={() => onSelect(op)}
                style={{ borderLeftColor: methodColor(op.method) }}
              >
                <span className="method" style={{ color: methodColor(op.method) }}>
                  {op.method}
                </span>
                <span className="op-text">
                  <span className="op-path">{op.path}</span>
                  {op.summary && <span className="op-summary">{op.summary}</span>}
                </span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}
