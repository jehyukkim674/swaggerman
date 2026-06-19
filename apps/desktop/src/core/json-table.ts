// 응답 JSON을 테이블로 시각화하기 위한 순수 로직.
// 객체 배열을 찾아 컬럼/행으로 변환한다. 의존성 없음.

export interface TableData {
  columns: string[];
  rows: Record<string, unknown>[];
  /** 실제 배열 길이가 행 상한을 넘어 잘렸는지. */
  truncated: boolean;
}

const MAX_ROWS = 1000;
const MAX_COLS = 40;
/** 객체 안에서 자동 탐색할 흔한 배열 필드명(우선순위 순). */
const COMMON_ARRAY_KEYS = ["content", "items", "data", "results", "list", "rows", "records", "value"];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 점 경로(`a.b[0].c`)로 값을 꺼낸다. 없으면 undefined. */
export function getByPath(root: unknown, path: string): unknown {
  if (!path.trim()) return root;
  const tokens = path
    .replace(/\[(\d+)\]/g, ".$1") // a[0] → a.0
    .split(".")
    .filter((t) => t !== "");
  let cur: unknown = root;
  for (const t of tokens) {
    if (Array.isArray(cur)) {
      const i = Number(t);
      if (!Number.isInteger(i)) return undefined;
      cur = cur[i];
    } else if (isObj(cur)) {
      cur = cur[t];
    } else {
      return undefined;
    }
    if (cur === undefined) return undefined;
  }
  return cur;
}

/** 객체 배열 → TableData. 객체 배열이 아니면 null. */
export function toTable(value: unknown): TableData | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every(isObj)) return null;
  const sliced = value.slice(0, MAX_ROWS) as Record<string, unknown>[];
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const row of sliced) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
        if (cols.length >= MAX_COLS) break;
      }
    }
    if (cols.length >= MAX_COLS) break;
  }
  return { columns: cols, rows: sliced, truncated: value.length > MAX_ROWS };
}

/** 응답 본문에서 테이블을 찾는다. path가 있으면 그 경로, 없으면 루트→흔한 키→임의 객체배열 순. */
export function findTable(body: string, path?: string): TableData | null {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  if (path && path.trim()) {
    return toTable(getByPath(json, path));
  }
  // 1) 루트가 객체 배열
  const direct = toTable(json);
  if (direct) return direct;
  // 2) 흔한 배열 키
  if (isObj(json)) {
    for (const k of COMMON_ARRAY_KEYS) {
      const t = toTable(json[k]);
      if (t) return t;
    }
    // 3) 임의의 객체배열 프로퍼티(첫 번째)
    for (const v of Object.values(json)) {
      const t = toTable(v);
      if (t) return t;
    }
  }
  return null;
}

/** 셀 표시 문자열. 객체/배열은 JSON으로 직렬화(길면 자른다). */
export function cellText(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "";
  if (typeof v === "object") {
    const s = JSON.stringify(v);
    return s.length > 120 ? s.slice(0, 117) + "…" : s;
  }
  return String(v);
}
