// 히스토리 비교용 순수 diff 로직. 외부 의존성 없음.

export interface FieldDiff {
  key: string;
  a?: string;
  b?: string;
  status: "added" | "removed" | "changed" | "same";
}

/** 두 키-값 맵을 키별로 비교한다. a에만 있으면 removed, b에만 있으면 added. 키 정렬 출력. */
export function diffRecords(
  a: Record<string, string>,
  b: Record<string, string>,
): FieldDiff[] {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.map((key) => {
    const av = a[key];
    const bv = b[key];
    let status: FieldDiff["status"];
    if (av === undefined) status = "added";
    else if (bv === undefined) status = "removed";
    else if (av !== bv) status = "changed";
    else status = "same";
    return { key, a: av, b: bv, status };
  });
}

export interface LineOp {
  type: "equal" | "add" | "remove";
  text: string;
}

// LCS 테이블이 너무 커지지 않게 하는 셀 수 상한(메모리 보호).
const MAX_LCS_CELLS = 4_000_000;

/** LCS 기반 줄 단위 diff. remove(=A에만) 먼저, add(=B에만) 나중 순서로 낸다.
 *  아주 큰 입력은 공통 접두/접미만 맞추고 가운데를 통째로 remove/add 처리(메모리 보호). */
export function diffLines(aText: string, bText: string): LineOp[] {
  const aAll = aText.split("\n");
  const bAll = bText.split("\n");

  // 공통 접두/접미 제거(대부분의 응답은 거의 같아서 LCS 대상이 크게 줄어든다)
  let start = 0;
  while (start < aAll.length && start < bAll.length && aAll[start] === bAll[start]) start++;
  let endA = aAll.length;
  let endB = bAll.length;
  while (endA > start && endB > start && aAll[endA - 1] === bAll[endB - 1]) {
    endA--;
    endB--;
  }

  const prefix: LineOp[] = aAll.slice(0, start).map((text) => ({ type: "equal" as const, text }));
  const suffix: LineOp[] = aAll.slice(endA).map((text) => ({ type: "equal" as const, text }));
  const a = aAll.slice(start, endA);
  const b = bAll.slice(start, endB);
  const n = a.length;
  const m = b.length;

  // 가운데 변경 구간이 너무 크면 LCS 생략(통째로 remove/add)
  if (n * m > MAX_LCS_CELLS) {
    return [
      ...prefix,
      ...a.map((text) => ({ type: "remove" as const, text })),
      ...b.map((text) => ({ type: "add" as const, text })),
      ...suffix,
    ];
  }

  // LCS 길이 테이블 (n+1) x (m+1)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  // 역추적
  const ops: LineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "equal", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "remove", text: a[i] });
      i++;
    } else {
      ops.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "remove", text: a[i++] });
  while (j < m) ops.push({ type: "add", text: b[j++] });
  return [...prefix, ...ops, ...suffix];
}

export type MarkedLineType = "equal" | "added" | "removed" | "changed-a" | "changed-b";

export interface MarkedLineOp {
  type: MarkedLineType;
  text: string;
}

/** diffLines 결과를 후처리해 "변경"을 구분한다.
 *  연속된 비-equal 묶음(hunk) 안에 remove와 add가 함께 있으면:
 *    그 hunk의 remove들 → changed-a(변경 전), add들 → changed-b(변경 후)
 *  remove만 있으면 removed, add만 있으면 added, equal은 equal 그대로. */
export function diffLinesMarked(aText: string, bText: string): MarkedLineOp[] {
  const ops = diffLines(aText, bText);
  const out: MarkedLineOp[] = [];

  let i = 0;
  while (i < ops.length) {
    if (ops[i].type === "equal") {
      out.push({ type: "equal", text: ops[i].text });
      i++;
      continue;
    }
    // 연속된 비-equal 묶음(hunk)을 한 번에 모은다
    let j = i;
    let hasRemove = false;
    let hasAdd = false;
    while (j < ops.length && ops[j].type !== "equal") {
      if (ops[j].type === "remove") hasRemove = true;
      else hasAdd = true;
      j++;
    }
    const mixed = hasRemove && hasAdd;
    for (let k = i; k < j; k++) {
      const text = ops[k].text;
      if (ops[k].type === "remove") {
        out.push({ type: mixed ? "changed-a" : "removed", text });
      } else {
        out.push({ type: mixed ? "changed-b" : "added", text });
      }
    }
    i = j;
  }
  return out;
}
