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

function pickKnown(obj: Record<string, unknown>): RequestSuggestion {
  const out: RequestSuggestion = {};
  for (const k of KNOWN_KEYS) {
    const v = obj[k];
    if (v === undefined) continue;
    if (k === "body" || k === "notes") {
      if (typeof v === "string") out[k] = v;
    } else if (typeof v === "object" && v !== null) {
      const rec: Record<string, string> = {};
      for (const [kk, vv] of Object.entries(v as Record<string, unknown>)) {
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
  // claude json 래퍼 벗기기
  if ("result" in obj) {
    const r = obj.result;
    if (typeof r === "string") {
      try {
        const inner = JSON.parse(r);
        if (typeof inner === "object" && inner !== null) return pickKnown(inner as Record<string, unknown>);
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

/** 제안을 현재 입력에 불변 병합한다(pathParams/query/headers/body만; 나머지 유지). */
export function applySuggestion(inputs: RequestInputs, s: RequestSuggestion): RequestInputs {
  return {
    ...inputs,
    pathParams: s.pathParams ? { ...inputs.pathParams, ...s.pathParams } : inputs.pathParams,
    queryParams: s.queryParams ? upsert(inputs.queryParams, s.queryParams) : inputs.queryParams,
    headers: s.headers ? upsert(inputs.headers, s.headers) : inputs.headers,
    body: s.body !== undefined ? s.body : inputs.body,
  };
}
