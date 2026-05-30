import type { HTTPMethod, HTTPRequest, ParsedOperation } from "./types";

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
    body: operation.requestBody ? "{}" : "",
  };
}

/** baseURL + operation + 입력값으로 HTTPRequest 구성. */
export function buildRequest(
  baseURL: string,
  operation: ParsedOperation,
  inputs: RequestInputs,
): HTTPRequest {
  let path = operation.path;
  for (const [key, value] of Object.entries(inputs.pathParams)) {
    path = path.replace(`{${key}}`, encodeURIComponent(value));
  }

  const base = baseURL.replace(/\/+$/, "");
  const url = new URL(base + path);
  for (const q of inputs.queryParams) {
    if (q.enabled && q.key && q.value !== "") url.searchParams.append(q.key, q.value);
  }

  const headers: Record<string, string> = {};
  for (const h of inputs.headers) {
    if (h.enabled && h.key && h.value !== "") headers[h.key] = h.value;
  }

  const body = inputs.body.trim();
  return {
    method: operation.method as HTTPMethod,
    url: url.toString(),
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
