import { useMemo } from "react";
import { tokenizeJson as tokenize, type JsonToken as Token } from "../core/json-tokenize";

interface Props {
  text: string;
  query: string;
  active: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function JsonView({ text, query, active, containerRef }: Props) {
  const lines = useMemo(() => text.split("\n"), [text]);
  const lq = query.toLowerCase();
  // 매우 큰 응답만 평문(성능). 일반적인 대형 응답도 색상이 보이도록 상향(6000→20000).
  const plain = lines.length > 20000;

  // 검색 매치에 전역 인덱스를 부여하기 위한 카운터(렌더 1회당 0부터)
  let matchIdx = 0;

  function renderToken(token: Token, key: number): React.ReactNode {
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
  }

  return (
    <div ref={containerRef} className={`resp-body code-view${plain ? " plain" : ""}`}>
      {lines.map((line, i) => (
        <div className="code-line" key={i}>
          <span className="ln">{i + 1}</span>
          <span className="lc">{plain ? line : tokenize(line).map((t, k) => renderToken(t, k))}</span>
        </div>
      ))}
    </div>
  );
}
