import type { RequestInputs, RequestParam } from "../request-builder";
import type { RequestSuggestion } from "./types";

/** claude --json-schema 로 강제할 요청 제안 스키마. */
export const requestSuggestionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    pathParams: { type: "object", additionalProperties: { type: "string" } },
    queryParams: { type: "object", additionalProperties: { type: "string" } },
    headers: { type: "object", additionalProperties: { type: "string" } },
    body: { type: "string" },
    notes: { type: "string" },
  },
} as const;

const KNOWN_KEYS: (keyof RequestSuggestion)[] = ["pathParams", "queryParams", "headers", "body", "notes"];

/** ```json ... ``` 또는 ``` ... ``` 코드펜스를 벗겨 순수 본문만 남긴다. */
function stripCodeFence(s: string): string {
  const m = s.match(/^\s*```(?:json|[a-zA-Z]*)?\s*\n([\s\S]*?)\n```\s*$/);
  return m ? m[1] : s;
}

function pickKnown(obj: Record<string, unknown>): RequestSuggestion {
  const out: RequestSuggestion = {};
  for (const k of KNOWN_KEYS) {
    const v = obj[k];
    if (v === undefined) continue;
    if (k === "body") {
      if (typeof v === "string") out.body = stripCodeFence(v);
    } else if (k === "notes") {
      // 문자열이 아닌 body/notes는 무시(스키마 강제가 AI 레이어에서 처리)
      if (typeof v === "string") out.notes = v;
    } else if (typeof v === "object" && v !== null) {
      const rec: Record<string, string> = {};
      for (const [kk, vv] of Object.entries(v as Record<string, unknown>)) {
        // 문자열이 아닌 딕셔너리 값은 문자열로 강제 변환
        rec[kk] = typeof vv === "string" ? vv : String(vv);
      }
      out[k] = rec;
    }
  }
  return out;
}

/** claude 출력(순수 제안 또는 {result} 래퍼)을 RequestSuggestion으로 파싱. 실패 시 null. */
export function parseSuggestion(raw: string): RequestSuggestion | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  // claude --json-schema 결과는 structured_output(이미 파싱된 객체)에 담긴다.
  const structured = obj["structured_output"];
  if (structured && typeof structured === "object") {
    return pickKnown(structured as Record<string, unknown>);
  }
  // claude json 래퍼 벗기기
  if ("result" in obj) {
    const r = obj.result;
    if (typeof r === "string") {
      try {
        // --json-schema 미사용 시 result는 ```json … ``` 코드펜스로 감싸일 수 있다.
        const inner = JSON.parse(stripCodeFence(r));
        if (typeof inner === "object" && inner !== null) return pickKnown(inner as Record<string, unknown>);
        return null; // valid JSON이지만 객체가 아님(예: "42", true)
      } catch {
        return null;
      }
    } else if (typeof r === "object" && r !== null) {
      return pickKnown(r as Record<string, unknown>);
    }
    return null;
  }
  return pickKnown(obj);
}

function upsert(list: RequestParam[], rec: Record<string, string>): RequestParam[] {
  const out = list.map((p) => ({ ...p }));
  for (const [key, value] of Object.entries(rec)) {
    const existing = out.find((p) => p.key === key);
    if (existing) {
      existing.value = value;
      existing.enabled = true;
    } else {
      out.push({ key, value, enabled: true });
    }
  }
  return out;
}

/** 제안을 현재 입력에 병합한다. pathParams/queryParams/headers/body는 새 객체/배열로 생성하고, form/bodyMode 등 나머지는 동일 참조로 유지한다. */
export function applySuggestion(inputs: RequestInputs, s: RequestSuggestion): RequestInputs {
  return {
    ...inputs,
    pathParams: s.pathParams ? { ...inputs.pathParams, ...s.pathParams } : inputs.pathParams,
    queryParams: s.queryParams ? upsert(inputs.queryParams, s.queryParams) : inputs.queryParams,
    headers: s.headers ? upsert(inputs.headers, s.headers) : inputs.headers,
    body: s.body !== undefined ? s.body : inputs.body,
  };
}

/** 제안의 query/path 키를 op 실제 파라미터명으로 필터링한다(폼 오염 방지). header는 통과. 불변. */
export function filterKnownParams(s: RequestSuggestion, opParamNames: string[]): RequestSuggestion {
  const allowed = new Set(opParamNames);
  const keep = (rec?: Record<string, string>) => {
    if (!rec) return rec;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(rec)) if (allowed.has(k)) out[k] = v;
    return out;
  };
  return {
    ...s,
    pathParams: keep(s.pathParams),
    queryParams: keep(s.queryParams),
    // headers는 표준/커스텀 헤더가 많아 op 파라미터명에 없어도 통과시킨다.
  };
}
