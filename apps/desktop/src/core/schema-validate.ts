// OpenAPI 스펙 인지 검증: 응답 body를 스키마와 대조 + 요청 사전 검증.
import type { ParsedOperation, ParsedSchema } from "./types";
import type { RequestInputs } from "./request-builder";

export interface ValidationIssue {
  path: string;
  message: string;
}

/** 값을 ParsedSchema와 대조한다. 추가 속성은 허용(누락/타입 불일치만 보고). */
export function validateAgainstSchema(
  value: unknown,
  schema: ParsedSchema | undefined,
  path = "$",
  depth = 0,
): ValidationIssue[] {
  if (!schema || depth > 8) return [];
  const issues: ValidationIssue[] = [];

  switch (schema.type) {
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return [{ path, message: `object 기대, 실제 ${typeName(value)}` }];
      }
      const obj = value as Record<string, unknown>;
      for (const req of schema.required ?? []) {
        if (!(req in obj)) issues.push({ path: `${path}.${req}`, message: "필수 속성 누락" });
      }
      for (const [key, sub] of Object.entries(schema.properties ?? {})) {
        if (key in obj) issues.push(...validateAgainstSchema(obj[key], sub, `${path}.${key}`, depth + 1));
      }
      break;
    }
    case "array": {
      if (!Array.isArray(value)) return [{ path, message: `array 기대, 실제 ${typeName(value)}` }];
      if (schema.items) {
        value.forEach((item, i) => {
          issues.push(...validateAgainstSchema(item, schema.items, `${path}[${i}]`, depth + 1));
        });
      }
      break;
    }
    case "string":
      if (typeof value !== "string") issues.push({ path, message: `string 기대, 실제 ${typeName(value)}` });
      else if (schema.enumValues?.length && !schema.enumValues.includes(value))
        issues.push({ path, message: `enum(${schema.enumValues.join(", ")}) 밖의 값: ${value}` });
      break;
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value))
        issues.push({ path, message: `integer 기대, 실제 ${typeName(value)}` });
      break;
    case "number":
      if (typeof value !== "number") issues.push({ path, message: `number 기대, 실제 ${typeName(value)}` });
      break;
    case "boolean":
      if (typeof value !== "boolean") issues.push({ path, message: `boolean 기대, 실제 ${typeName(value)}` });
      break;
    default:
      break; // unknown: 검증 안 함
  }
  return issues;
}

function typeName(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/** 상태코드에 맞는 응답 스키마로 body를 검증한다. */
export function validateResponseBody(
  operation: ParsedOperation,
  status: number,
  body: string,
): ValidationIssue[] {
  const def =
    operation.responses.find((r) => r.statusCode === String(status)) ??
    operation.responses.find((r) => r.statusCode === "default");
  if (!def?.schema) return [];
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return [{ path: "$", message: "응답이 JSON이 아님(스키마 검증 불가)" }];
  }
  return validateAgainstSchema(json, def.schema);
}

/** 전송 전 요청 입력을 검증한다(필수 path/query 누락, 필수 body 누락). */
export function validateRequestInputs(
  operation: ParsedOperation,
  inputs: RequestInputs,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const param of operation.parameters) {
    if (!param.required) continue;
    if (param.location === "path") {
      if (!(inputs.pathParams[param.name] ?? "").trim())
        issues.push({ path: param.name, message: "필수 path 파라미터 누락" });
    } else if (param.location === "query") {
      const q = inputs.queryParams.find((x) => x.key === param.name);
      if (!q || !q.enabled || !q.value.trim())
        issues.push({ path: param.name, message: "필수 query 파라미터 누락" });
    }
  }
  if (operation.requestBody?.required) {
    const mode = inputs.bodyMode ?? "raw";
    const hasBody = mode === "raw" ? inputs.body.trim().length > 0 : (inputs.form ?? []).length > 0;
    if (!hasBody) issues.push({ path: "body", message: "필수 요청 body 누락" });
  }
  return issues;
}
