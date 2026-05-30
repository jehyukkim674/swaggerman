import { useMemo } from "react";

interface Props {
  text: string;
  query: string;
  active: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

// JSON 토큰: 키("...":), 문자열, 불리언/null, 숫자, 구두점
const TOKEN_RE =
  /("(?:\\.|[^"\\])*")(\s*:)|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|([{}[\],:])/g;

interface Token {
  cls: string;
  text: string;
}

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(line)) !== null) {
    if (m.index > last) tokens.push({ cls: "", text: line.slice(last, m.index) });
    if (m[1]) {
      tokens.push({ cls: "tk-key", text: m[1] });
      tokens.push({ cls: "tk-punct", text: m[2] });
    } else if (m[3]) {
      tokens.push({ cls: "tk-str", text: m[3] });
    } else if (m[4]) {
      tokens.push({ cls: m[4] === "null" ? "tk-null" : "tk-bool", text: m[4] });
    } else if (m[5]) {
      tokens.push({ cls: "tk-num", text: m[5] });
    } else if (m[6]) {
      tokens.push({ cls: "tk-punct", text: m[6] });
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) tokens.push({ cls: "", text: line.slice(last) });
  return tokens;
}

export function JsonView({ text, query, active, containerRef }: Props) {
  const lines = useMemo(() => text.split("\n"), [text]);
  const lq = query.toLowerCase();
  // 매우 큰 응답은 구문 강조 없이 평문(성능)
  const plain = lines.length > 6000;

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
