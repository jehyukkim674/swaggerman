import type { HTTPMethod, HTTPRequest, ParsedOperation, ParsedSchema } from "./types";

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

export interface RequestInputs {
  pathParams: Record<string, string>;
  queryParams: RequestParam[];
  headers: RequestParam[];
  body: string;
}

/** operation의 기본 입력값(빈 path/query, 기본 헤더) 생성. */
export function defaultInputs(operation: ParsedOperation): RequestInputs {
  const pathParams: Record<string, string> = {};
  const queryParams: RequestParam[] = [];
  for (const param of operation.parameters) {
    if (param.location === "path") pathParams[param.name] = "";
    if (param.location === "query")
      queryParams.push({ key: param.name, value: "", enabled: true });
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
  };
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

/** baseURL + operation + 입력값으로 요청 URL을 계산(미리보기/전송 공용). */
export function buildRequestUrl(
  baseURL: string,
  operation: ParsedOperation,
  inputs: RequestInputs,
): string {
  let path = operation.path;
  for (const [key, value] of Object.entries(inputs.pathParams)) {
    path = path.replace(`{${key}}`, encodeURIComponent(value));
  }
  const base = baseURL.replace(/\/+$/, "");
  try {
    const url = new URL(base + path);
    for (const q of inputs.queryParams) {
      if (q.enabled && q.key && q.value !== "") url.searchParams.append(q.key, q.value);
    }
    return url.toString();
  } catch {
    return base + path;
  }
}

/** baseURL + operation + 입력값(+ 인증 헤더)으로 HTTPRequest 구성. */
export function buildRequest(
  baseURL: string,
  operation: ParsedOperation,
  inputs: RequestInputs,
  securityHeaders: Record<string, string> = {},
): HTTPRequest {
  const headers: Record<string, string> = {};
  for (const h of inputs.headers) {
    if (h.enabled && h.key && h.value !== "") headers[h.key] = h.value;
  }
  // 인증 헤더가 수동 헤더를 덮어쓴다(Authorize에서 설정한 값 우선).
  for (const [key, value] of Object.entries(securityHeaders)) {
    if (value) headers[key] = value;
  }

  const body = inputs.body.trim();
  return {
    method: operation.method as HTTPMethod,
    url: buildRequestUrl(baseURL, operation, inputs),
    headers,
    body: body.length > 0 ? body : undefined,
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
