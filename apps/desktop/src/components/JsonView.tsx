import { useEffect, useState } from "react";
import { tokenizeJson as tokenize, type JsonToken as Token } from "../core/json-tokenize";

// 줄 높이(px): font-size 12px × line-height 1.5 = 18px. ResponseView가 스크롤 위치 계산에 사용.
export const LINE_HEIGHT = 18;
// 보이는 범위 위아래로 여유 렌더링하는 줄 수.
const OVERSCAN = 20;
// 컨테이너 높이를 측정할 수 없을 때(jsdom·숨김 상태) 폴백.
const FALLBACK_HEIGHT = 800;

interface Props {
  lines: string[]; // text 대신 분할된 줄 배열을 받음 (중복 split 제거)
  query: string;
  active: number; // 활성 매치의 글로벌 인덱스
  lineMatchStarts: Map<number, number>; // 줄 인덱스 → 그 줄 첫 매치의 글로벌 매치 인덱스 (query 없으면 빈 Map)
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function JsonView({ lines, query, active, lineMatchStarts, containerRef }: Props) {
  const lq = query.toLowerCase();
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(FALLBACK_HEIGHT);

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
  }, [containerRef]);

  // 새 응답으로 줄 배열이 바뀌면 스크롤을 맨 위로 리셋(이전 응답의 stale scrollTop 잔존 방지).
  useEffect(() => {
    const el = containerRef.current;
    if (el && el.scrollTop !== 0) el.scrollTop = 0;
    setScrollTop(0);
  }, [lines, containerRef]);

  const start = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN);
  const end = Math.min(lines.length, Math.ceil((scrollTop + height) / LINE_HEIGHT) + OVERSCAN);

  // 한 줄의 토큰을 렌더링. matchIdx는 이 줄 첫 매치의 글로벌 인덱스(없으면 undefined).
  function renderLine(line: string, matchStart: number | undefined): React.ReactNode {
    const tokens = tokenize(line);
    // 이 줄의 매치에 부여할 글로벌 인덱스(왼쪽→오른쪽 증가)
    let matchIdx = matchStart ?? 0;
    return tokens.map((token: Token, key: number) => {
      if (!query || !token.text.toLowerCase().includes(lq)) {
        return (
          <span className={token.cls} key={key}>
            {token.text}
          </span>
        );
      }
      // 토큰 내 매치를 <mark>로 분할
      const parts: React.ReactNode[] = [];
      const lower = token.text.toLowerCase();
      let i = 0;
      let idx = lower.indexOf(lq);
      let pk = 0;
      while (idx !== -1) {
        if (idx > i) parts.push(token.text.slice(i, idx));
        const mi = matchIdx++;
        parts.push(
          <mark key={`m${pk++}`} data-match={mi} className={mi === active ? "hl active" : "hl"}>
            {token.text.slice(idx, idx + query.length)}
          </mark>,
        );
        i = idx + query.length;
        idx = lower.indexOf(lq, i);
      }
      if (i < token.text.length) parts.push(token.text.slice(i));
      return (
        <span className={token.cls} key={key}>
          {parts}
        </span>
      );
    });
  }

  const visible: React.ReactNode[] = [];
  for (let i = start; i < end; i++) {
    visible.push(
      <div className="code-line" key={i} style={{ height: LINE_HEIGHT }}>
        <span className="ln">{i + 1}</span>
        <span className="lc">{renderLine(lines[i], lineMatchStarts.get(i))}</span>
      </div>,
    );
  }

  return (
    <div
      ref={containerRef}
      className="resp-body code-view"
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
    >
      <div style={{ height: lines.length * LINE_HEIGHT, position: "relative" }}>
        <div style={{ position: "absolute", top: start * LINE_HEIGHT, left: 0, right: 0 }}>
          {visible}
        </div>
      </div>
    </div>
  );
}
