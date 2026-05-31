import { useMemo, useState } from "react";
import type { ParsedOperation } from "../core/types";
import type { Collection, SavedRequest } from "../core/collections";
import { methodColor } from "./method";

interface Props {
  operations: ParsedOperation[];
  collections: Collection[];
  onSelectOperation: (op: ParsedOperation) => void;
  onSelectSaved: (s: SavedRequest) => void;
  onClose: () => void;
  onAskAiResponse?: (kind: "diagnose" | "explain") => void;
  hasResponse?: boolean;
  responseIsError?: boolean;
}

interface Item {
  key: string;
  method: string;
  label: string;
  sub: string;
  run: () => void;
}

/** ⌘K 커맨드 팔레트: 오퍼레이션 + 저장 요청 빠른 검색·이동. */
export function CommandPalette({
  operations,
  collections,
  onSelectOperation,
  onSelectSaved,
  onClose,
  onAskAiResponse,
  hasResponse,
  responseIsError,
}: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    if (hasResponse && onAskAiResponse) {
      list.push({
        key: "ai-explain",
        method: "AI",
        label: "응답 설명",
        sub: "직전 응답을 AI로 요약·설명",
        run: () => onAskAiResponse("explain"),
      });
      if (responseIsError) {
        list.push({
          key: "ai-diagnose",
          method: "AI",
          label: "응답 진단",
          sub: "실패 원인을 AI로 진단",
          run: () => onAskAiResponse("diagnose"),
        });
      }
    }
    for (const op of operations) {
      list.push({
        key: `op:${op.id}`,
        method: op.method,
        label: op.path,
        sub: op.summary ?? "",
        run: () => onSelectOperation(op),
      });
    }
    for (const c of collections) {
      for (const r of c.requests) {
        list.push({
          key: `saved:${r.id}`,
          method: r.method,
          label: r.name,
          sub: `${c.name} · ${r.url}`,
          run: () => onSelectSaved(r),
        });
      }
    }
    return list;
  }, [operations, collections, onSelectOperation, onSelectSaved, onAskAiResponse, hasResponse, responseIsError]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.slice(0, 50);
    return items
      .filter(
        (it) =>
          it.label.toLowerCase().includes(needle) ||
          it.sub.toLowerCase().includes(needle) ||
          it.method.toLowerCase().includes(needle),
      )
      .slice(0, 50);
  }, [items, q]);

  const choose = (it: Item | undefined) => {
    if (!it) return;
    it.run();
    onClose();
  };

  return (
    <div className="modal-overlay palette-overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          className="palette-input"
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(filtered.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(filtered[active]);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          placeholder="오퍼레이션 / 저장 요청 검색… (↑↓ 이동, Enter 선택, Esc 닫기)"
          spellCheck={false}
        />
        <div className="palette-list">
          {filtered.length === 0 && <div className="hint">결과 없음</div>}
          {filtered.map((it, i) => (
            <div
              className={i === active ? "palette-item active" : "palette-item"}
              key={it.key}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(it);
              }}
            >
              <span className="method-mini" style={{ color: methodColor(it.method) }}>
                {it.method}
              </span>
              <span className="palette-label">{it.label}</span>
              {it.sub && <span className="palette-sub">{it.sub}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
