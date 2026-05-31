// JSON 한 줄을 색상 토큰으로 분해. JsonView(읽기)와 JsonEditor(편집)에서 공용.

export interface JsonToken {
  cls: string;
  text: string;
}

// 키("...":), 문자열, 불리언/null, 숫자, 구두점
const TOKEN_RE =
  /("(?:\\.|[^"\\])*")(\s*:)|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|([{}[\],:])/g;

export function tokenizeJson(line: string): JsonToken[] {
  const tokens: JsonToken[] = [];
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
