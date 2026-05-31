// 변수 치환 · 응답 값 추출(체이닝) · 어서션 로직.
// 순수 함수만 모아 단위 테스트로 검증한다.

/** 지원하는 동적 변수 이름 목록(자동완성 제안용). */
export const DYNAMIC_VARS = [
  "$timestamp",
  "$isoTimestamp",
  "$guid",
  "$randomUUID",
  "$randomInt",
] as const;

/** 동적 변수(`$`로 시작) 값을 계산한다. 미지원이면 null. (Postman 유사) */
export function dynamicValue(name: string): string | null {
  switch (name) {
    case "$timestamp":
      return String(Math.floor(Date.now() / 1000));
    case "$isoTimestamp":
      return new Date().toISOString();
    case "$guid":
    case "$randomUUID":
      return typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    case "$randomInt":
      return String(Math.floor(Math.random() * 1000));
    default:
      return null;
  }
}

/** `{{ name }}` 패턴을 치환한다.
 *  우선순위: vars 맵 → 동적 변수(`{{$...}}`) → 미정의면 원문 유지. */
export function substituteVars(text: string, vars: Record<string, string>): string {
  if (!text) return text;
  return text.replace(/\{\{\s*([\w.$-]+)\s*\}\}/g, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
    if (name.startsWith("$")) {
      const dyn = dynamicValue(name);
      if (dyn !== null) return dyn;
    }
    return match;
  });
}

/** 텍스트에 등장하는 변수 이름 목록(중복 제거, 등장 순). */
export function extractVarNames(text: string): string[] {
  if (!text) return [];
  const names: string[] = [];
  const re = /\{\{\s*([\w.-]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

/** vars 맵에 값이 없는(미해결) 변수 이름 목록. */
export function unresolvedVars(text: string, vars: Record<string, string>): string[] {
  return extractVarNames(text).filter(
    (name) => !Object.prototype.hasOwnProperty.call(vars, name) || vars[name] === "",
  );
}

/** 점/대괄호 표기의 간단한 JSONPath로 값을 읽는다.
 *  지원: `data.token`, `items.0.id`, `items[0].id`, 선행 `$.` 허용. */
export function extractByPath(json: unknown, path: string): unknown {
  if (!path) return undefined;
  const normalized = path.replace(/^\$\.?/, "").replace(/\[(\d+)\]/g, ".$1");
  const segments = normalized.split(".").filter((s) => s.length > 0);
  let current: unknown = json;
  for (const seg of segments) {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      const idx = Number(seg);
      if (Number.isNaN(idx)) return undefined;
      current = current[idx];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return current;
}

/** 추출 규칙: 응답 body(JSON)의 path 값을 변수 varName에 저장. */
export interface ExtractRule {
  varName: string;
  path: string;
}

/** 응답 body(JSON 문자열)에서 규칙대로 값을 추출해 변수 맵을 만든다.
 *  파싱 실패하거나 path가 없으면 해당 규칙은 건너뛴다. */
export function applyExtractRules(
  responseBody: string,
  rules: ExtractRule[],
): Record<string, string> {
  if (rules.length === 0) return {};
  let json: unknown;
  try {
    json = JSON.parse(responseBody);
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const rule of rules) {
    if (!rule.varName || !rule.path) continue;
    const value = extractByPath(json, rule.path);
    if (value === undefined) continue;
    out[rule.varName] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return out;
}

export type AssertionKind = "status" | "jsonpath";
export type AssertionOp = "equals" | "contains" | "exists";

/** 응답 검증 규칙. status 또는 응답 body의 jsonpath 값을 비교한다. */
export interface Assertion {
  kind: AssertionKind;
  path?: string; // jsonpath일 때 사용
  op: AssertionOp;
  expected?: string;
}

export interface AssertionResult {
  ok: boolean;
  label: string;
  detail: string;
}

/** 어서션을 실행해 통과/실패와 설명을 반환한다. */
export function runAssertions(
  status: number,
  responseBody: string,
  assertions: Assertion[],
): AssertionResult[] {
  let json: unknown;
  let parsed = false;
  try {
    json = JSON.parse(responseBody);
    parsed = true;
  } catch {
    parsed = false;
  }

  return assertions.map((a) => {
    if (a.kind === "status") {
      const actual = String(status);
      const ok = compare(actual, a.op, a.expected);
      return {
        ok,
        label: `status ${a.op} ${a.expected ?? ""}`.trim(),
        detail: `실제 status=${actual}`,
      };
    }
    // jsonpath
    if (!parsed) {
      return { ok: false, label: `${a.path} ${a.op}`, detail: "응답이 JSON이 아님" };
    }
    const value = extractByPath(json, a.path ?? "");
    if (a.op === "exists") {
      const ok = value !== undefined;
      return { ok, label: `${a.path} 존재`, detail: ok ? "있음" : "없음" };
    }
    const actual =
      value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
    const ok = value !== undefined && compare(actual, a.op, a.expected);
    return {
      ok,
      label: `${a.path} ${a.op} ${a.expected ?? ""}`.trim(),
      detail: value === undefined ? "값 없음" : `실제=${actual}`,
    };
  });
}

function compare(actual: string, op: AssertionOp, expected: string | undefined): boolean {
  const exp = expected ?? "";
  switch (op) {
    case "equals":
      return actual === exp;
    case "contains":
      return actual.includes(exp);
    case "exists":
      return actual.length > 0;
    default:
      return false;
  }
}
