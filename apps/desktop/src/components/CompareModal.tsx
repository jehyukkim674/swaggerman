import { useEffect, useMemo, useRef, useState } from "react";
import type { HistoryItem } from "../core/history";
import type { RequestParam } from "../core/request-builder";
import { diffLines, diffRecords, diffLinesMarked, type FieldDiff } from "../core/diff";
import { methodColor, statusColor } from "./method";
import { CloseCircleIcon } from "./icons";
import { Minimap } from "./Minimap";
import { relativeTime } from "../core/history";

interface Props {
  a: HistoryItem;
  b: HistoryItem;
  onClose: () => void;
}

// 가상 스크롤 줄 높이(px): font-size 12px × line-height 1.5 = 18px.
const LINE_HEIGHT = 18;
// 보이는 범위 위아래로 여유 렌더링하는 줄 수.
const OVERSCAN = 20;
// 컨테이너 높이를 측정할 수 없을 때(jsdom·숨김 상태) 폴백.
const FALLBACK_HEIGHT = 800;

// diff 타입별 미니맵 마크 색상(equal은 마크 없음).
const MARK_COLORS: Record<string, string> = {
  added: "#3fb950",
  removed: "#f85149",
  "changed-a": "#d29922",
  "changed-b": "#d29922",
};

// diff 타입별 줄 앞 부호.
function signOf(type: string): string {
  if (type === "added") return "+";
  if (type === "removed") return "-";
  if (type === "changed-a" || type === "changed-b") return "~";
  return " ";
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

/** 줄 단위 diff(요청 Body용). 모든 줄을 DOM으로 렌더(요청 Body는 작아 가상화 불필요). */
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

/** 한 줄 텍스트에서 검색어(대소문자 무시)를 <mark>로 분할. 활성 매치는 hl active.
 *  matchStart는 이 줄 첫 매치의 글로벌 인덱스(없으면 매치 없음). */
function renderLineText(text: string, query: string, matchStart: number | undefined, active: number): React.ReactNode {
  if (!query || matchStart === undefined) return text;
  const lower = text.toLowerCase();
  const lq = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let idx = lower.indexOf(lq);
  let matchIdx = matchStart;
  let pk = 0;
  while (idx !== -1) {
    if (idx > i) parts.push(text.slice(i, idx));
    const mi = matchIdx++;
    parts.push(
      <mark key={`m${pk++}`} data-match={mi} className={mi === active ? "hl active" : "hl"}>
        {text.slice(idx, idx + query.length)}
      </mark>,
    );
    i = idx + query.length;
    idx = lower.indexOf(lq, i);
  }
  if (i < text.length) parts.push(text.slice(i));
  return parts;
}

/** 응답 BODY 전용 diff 뷰. 가상 스크롤(JsonView 패턴) + 검색 하이라이트 + 미니맵 연동. */
function ResponseDiffView({ a, b }: { a: string; b: string }) {
  const ops = useMemo(() => diffLinesMarked(a, b), [a, b]);
  const lines = useMemo(() => ops.map((o) => o.text), [ops]);

  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(FALLBACK_HEIGHT);
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 컨테이너 높이 측정(측정 0이면 폴백). resize / ResizeObserver로 갱신.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      setHeight(h > 0 ? h : FALLBACK_HEIGHT);
    };
    measure();
    window.addEventListener("resize", measure);
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, []);

  // 검색 매치 집계: 매치 줄 Set(미니맵용) + 글로벌 매치 인덱스 → 줄, 줄 → 첫 매치 글로벌 인덱스.
  const { matchLines, matchCount, matchLineOf, lineMatchStarts } = useMemo(() => {
    const set = new Set<number>();
    const lineOf: number[] = [];
    const starts = new Map<number, number>();
    let count = 0;
    if (submitted) {
      const q = submitted.toLowerCase();
      lines.forEach((line, i) => {
        const lower = line.toLowerCase();
        let idx = lower.indexOf(q);
        if (idx === -1) return;
        set.add(i);
        starts.set(i, count);
        while (idx !== -1) {
          lineOf[count] = i;
          count += 1;
          idx = lower.indexOf(q, idx + q.length);
        }
      });
    }
    return { matchLines: set, matchCount: count, matchLineOf: lineOf, lineMatchStarts: starts };
  }, [lines, submitted]);

  // diff 줄 위치 → 미니맵 색상 마크(검색 매치보다 낮은 우선순위).
  const marks = useMemo(() => {
    const m = new Map<number, string>();
    ops.forEach((op, i) => {
      const color = MARK_COLORS[op.type];
      if (color) m.set(i, color);
    });
    return m;
  }, [ops]);

  useEffect(() => {
    setActive(0);
  }, [submitted]);

  // 활성 매치로 스크롤(가상화로 DOM에 없는 매치도 위치 계산으로 이동).
  useEffect(() => {
    if (!submitted || matchCount === 0) return;
    const el = containerRef.current;
    if (!el) return;
    const line = matchLineOf[active];
    if (line === undefined) return;
    el.scrollTop = line * LINE_HEIGHT - el.clientHeight / 2;
  }, [active, submitted, matchCount, matchLineOf]);

  const goNext = () => {
    if (matchCount > 0) setActive((x) => (x + 1) % matchCount);
  };
  const goPrev = () => {
    if (matchCount > 0) setActive((x) => (x - 1 + matchCount) % matchCount);
  };

  const start = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN);
  const end = Math.min(lines.length, Math.ceil((scrollTop + height) / LINE_HEIGHT) + OVERSCAN);

  const visible: React.ReactNode[] = [];
  for (let i = start; i < end; i++) {
    const op = ops[i];
    visible.push(
      <div className={`cmp-line cmp-line-${op.type}`} key={i} style={{ height: LINE_HEIGHT }}>
        <span className="cmp-line-sign">{signOf(op.type)}</span>
        <span className="cmp-line-text">{renderLineText(op.text, submitted, lineMatchStarts.get(i), active)}</span>
      </div>,
    );
  }

  return (
    <div className="cmp-right">
      <div className="cmp-search-bar">
        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (submitted === search && matchCount > 0) {
                if (e.shiftKey) goPrev();
                else goNext();
              } else {
                setSubmitted(search);
              }
            }
            if (e.key === "Escape") {
              setSearch("");
              setSubmitted("");
            }
          }}
          placeholder="응답 diff 검색 후 Enter"
          spellCheck={false}
        />
        {(search || submitted) && (
          <button
            className="search-clear"
            onClick={() => {
              setSearch("");
              setSubmitted("");
            }}
            title="검색 지우기 (Esc)"
            aria-label="검색 지우기"
          >
            <CloseCircleIcon size={16} />
          </button>
        )}
        {submitted &&
          (matchCount === 0 ? (
            <span className="match none">일치 없음</span>
          ) : (
            <span className="match-nav">
              <button className="btn small" onClick={goPrev} title="이전 매치 (Shift+Enter)">
                ‹
              </button>
              <span className="match">
                {active + 1}/{matchCount}
              </span>
              <button className="btn small" onClick={goNext} title="다음 매치 (Enter)">
                ›
              </button>
            </span>
          ))}
        <span className="cmp-legend-bar">
          <span className="cmp-legend-chip cmp-legend-added">+ 추가</span>
          <span className="cmp-legend-chip cmp-legend-removed">– 삭제</span>
          <span className="cmp-legend-chip cmp-legend-changed">~ 변경</span>
          <span className="cmp-legend-chip cmp-legend-match">▌검색</span>
        </span>
      </div>

      <div className="cmp-diff-wrap">
        <div
          ref={containerRef}
          className="cmp-diff-virtual"
          onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        >
          <div style={{ height: lines.length * LINE_HEIGHT, position: "relative" }}>
            <div style={{ position: "absolute", top: start * LINE_HEIGHT, left: 0, right: 0 }}>{visible}</div>
          </div>
        </div>
        <Minimap lines={lines} scrollRef={containerRef} matchLines={matchLines} marks={marks} />
      </div>
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

        <div className="modal-body cmp-columns">
          {/* 왼쪽: 요청 정보(메타 + 파라미터 + 요청 Body) */}
          <div className="cmp-left">
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
          </div>

          {/* 오른쪽: 응답 BODY diff 전용 */}
          <ResponseDiffView a={pretty(a.responseBody)} b={pretty(b.responseBody)} />
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
