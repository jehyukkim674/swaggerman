import type {
  HTTPMethod,
  HTTPRequest,
  ParsedOperation,
  ParsedParameter,
  ParsedSchema,
} from "./types";
import { substituteVars } from "./variables";

/** 스키마로부터 예시 JSON 값을 생성한다(요청 body 미리 채우기용). */
export function schemaToExample(schema: ParsedSchema | undefined, depth = 0): unknown {
  if (!schema || depth > 6) return null;
  switch (schema.type) {
    case "object": {
      const obj: Record<string, unknown> = {};
      if (schema.properties) {
        for (const [key, value] of Object.entries(schema.properties)) {
          obj[key] = schemaToExample(value, depth + 1);
        }
      }
      return obj;
    }
    case "array":
      return schema.items ? [schemaToExample(schema.items, depth + 1)] : [];
    case "string":
      if (schema.enumValues && schema.enumValues.length > 0) return schema.enumValues[0];
      if (schema.example != null) return schema.example;
      if (schema.defaultValue != null) return schema.defaultValue;
      return "";
    case "integer":
    case "number": {
      const raw = schema.example ?? schema.defaultValue;
      const n = raw != null ? Number(raw) : NaN;
      return Number.isNaN(n) ? 0 : n;
    }
    case "boolean":
      return schema.defaultValue === "true";
    default:
      return null;
  }
}

export interface RequestParam {
  key: string;
  value: string;
  enabled: boolean;
}

export type BodyMode = "none" | "raw" | "urlencoded" | "multipart";

export interface FormField {
  name: string;
  value: string;
  filePath?: string; // 멀티파트 파일 경로(있으면 파일 파트)
  contentType?: string;
  enabled: boolean;
}

export interface RequestInputs {
  pathParams: Record<string, string>;
  queryParams: RequestParam[];
  headers: RequestParam[];
  body: string;
  bodyMode?: BodyMode; // 없으면 raw로 간주(하위호환)
  form?: FormField[];
}

/** 파라미터의 스펙 기본값: example → default → enum 첫값 →
 *  object/array면 스키마로 예시 JSON 생성 → 그 외 빈 문자열. */
export function defaultParamValue(param: ParsedParameter): string {
  const s = param.schema;
  if (!s) return "";
  if (s.example != null && s.example !== "") return String(s.example);
  if (s.defaultValue != null && s.defaultValue !== "") return String(s.defaultValue);
  if (s.enumValues && s.enumValues.length > 0) return s.enumValues[0];
  if (s.type === "object" || s.type === "array") {
    return JSON.stringify(schemaToExample(s));
  }
  return "";
}

/** operation의 기본 입력값(스펙 example/default/enum로 path·query 미리 채움, 기본 헤더) 생성. */
export function defaultInputs(operation: ParsedOperation): RequestInputs {
  const pathParams: Record<string, string> = {};
  const queryParams: RequestParam[] = [];
  for (const param of operation.parameters) {
    if (param.location === "path") pathParams[param.name] = defaultParamValue(param);
    if (param.location === "query")
      queryParams.push({ key: param.name, value: defaultParamValue(param), enabled: true });
  }
  const headers: RequestParam[] = [{ key: "Accept", value: "application/json", enabled: true }];
  if (operation.requestBody) {
    headers.unshift({ key: "Content-Type", value: "application/json", enabled: true });
  }
  return {
    pathParams,
    queryParams,
    headers,
    body: defaultBody(operation),
    bodyMode: operation.requestBody ? "raw" : "none",
    form: [],
  };
}

/** 마지막 요청 정보 복원: 저장된 입력값(localStorage)이 있으면 그대로, 없으면 스펙 기본값.
 *  사용자가 추가/수정한 파라미터 행도 저장된 그대로 보존된다. */
export function restoreInputs(
  saved: Record<string, RequestInputs>,
  operation: ParsedOperation,
): RequestInputs {
  return saved[operation.id] ?? defaultInputs(operation);
}

/** 요청 body 초기값: 스펙 example 우선 → 스키마 생성 → 빈 객체. */
export function defaultBody(operation: ParsedOperation): string {
  const requestBody = operation.requestBody;
  if (!requestBody) return "";
  if (requestBody.example !== undefined) {
    return JSON.stringify(requestBody.example, null, 2);
  }
  if (requestBody.schema) {
    return JSON.stringify(schemaToExample(requestBody.schema), null, 2);
  }
  return "{}";
}

/** baseURL + operation + 입력값으로 요청 URL을 계산.
 *  encode=false: 사람이 읽기 좋은 raw 문자열(미리보기용, 한글 그대로)
 *  encode=true(기본): 퍼센트 인코딩된 실제 요청 URL
 *  vars: `{{name}}` 변수 치환 맵(없으면 치환 안 함) */
export function buildRequestUrl(
  baseURL: string,
  operation: ParsedOperation,
  inputs: RequestInputs,
  encode = true,
  vars: Record<string, string> = {},
): string {
  const sub = (s: string) => substituteVars(s, vars);
  const base = sub(baseURL).replace(/\/+$/, "");

  if (!encode) {
    let path = operation.path;
    for (const [key, value] of Object.entries(inputs.pathParams)) {
      path = path.replace(`{${key}}`, sub(value));
    }
    const query = inputs.queryParams
      .filter((q) => q.enabled && q.key && q.value !== "")
      .map((q) => `${q.key}=${sub(q.value)}`)
      .join("&");
    return base + path + (query ? `?${query}` : "");
  }

  let path = operation.path;
  for (const [key, value] of Object.entries(inputs.pathParams)) {
    path = path.replace(`{${key}}`, encodeURIComponent(sub(value)));
  }
  try {
    const url = new URL(base + path);
    for (const q of inputs.queryParams) {
      if (q.enabled && q.key && q.value !== "") url.searchParams.append(q.key, sub(q.value));
    }
    return url.toString();
  } catch {
    return base + path;
  }
}

/** baseURL + operation + 입력값(+ 인증 헤더 + 전역 헤더)으로 HTTPRequest 구성.
 *  우선순위: 전역 헤더(기본) < 요청별 헤더 < 인증 헤더 */
export function buildRequest(
  baseURL: string,
  operation: ParsedOperation,
  inputs: RequestInputs,
  securityHeaders: Record<string, string> = {},
  globalHeaders: RequestParam[] = [],
  vars: Record<string, string> = {},
): HTTPRequest {
  const sub = (s: string) => substituteVars(s, vars);
  const headers: Record<string, string> = {};
  // 전역 기본 헤더(모든 요청에 적용, 가장 낮은 우선순위)
  for (const h of globalHeaders) {
    if (h.enabled && h.key && h.value !== "") headers[h.key] = sub(h.value);
  }
  // 요청별 헤더가 전역을 덮어씀
  for (const h of inputs.headers) {
    if (h.enabled && h.key && h.value !== "") headers[h.key] = sub(h.value);
  }
  // 인증 헤더가 최우선(Authorize에서 설정한 값)
  for (const [key, value] of Object.entries(securityHeaders)) {
    if (value) headers[key] = sub(value);
  }

  const method = operation.method as HTTPMethod;
  const url = buildRequestUrl(baseURL, operation, inputs, true, vars);
  const mode = inputs.bodyMode ?? "raw";

  // form 모드(urlencoded/multipart): 활성·이름 있는 파트만, 값은 변수 치환
  if (mode === "urlencoded" || mode === "multipart") {
    const form = (inputs.form ?? [])
      .filter((f) => f.enabled && f.name)
      .map((f) => ({
        name: f.name,
        value: sub(f.value),
        filePath: f.filePath || undefined,
        contentType: f.contentType || undefined,
      }));
    return { method, url, headers, form, multipart: mode === "multipart" };
  }

  // raw / none
  const body = sub(inputs.body).trim();
  return {
    method,
    url,
    headers,
    body: mode === "none" ? undefined : body.length > 0 ? body : undefined,
  };
}

/** spec URL에서 baseURL 추정 (origin). */
export function deriveBaseURL(specURL: string, specServers: string[]): string {
  if (specServers.length > 0) {
    const server = specServers[0];
    if (server.startsWith("http")) return server;
    try {
      return new URL(server, specURL).toString().replace(/\/+$/, "");
    } catch {
      /* ignore */
    }
  }
  try {
    return new URL(specURL).origin;
  } catch {
    return specURL;
  }
}
