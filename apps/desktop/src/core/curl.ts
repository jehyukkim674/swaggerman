// cURL 명령 문자열을 파싱해 요청 구성요소로 변환한다(붙여넣기 import 용).
import type { HTTPMethod, ParsedOperation } from "./types";
import type { RequestInputs, RequestParam } from "./request-builder";

export interface ParsedCurl {
  method: HTTPMethod;
  url: string;
  headers: { key: string; value: string }[];
  body: string;
}

/** 셸 토큰화: 따옴표('/")와 백슬래시 줄바꿈(\\\n)을 처리한다. */
export function tokenizeCurl(input: string): string[] {
  const text = input.replace(/\\\r?\n/g, " ").trim();
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    let token = "";
    while (i < text.length && !/\s/.test(text[i])) {
      const c = text[i];
      if (c === "'") {
        i++;
        while (i < text.length && text[i] !== "'") token += text[i++];
        i++; // 닫는 따옴표
      } else if (c === '"') {
        i++;
        while (i < text.length && text[i] !== '"') {
          if (text[i] === "\\" && i + 1 < text.length) {
            i++;
            token += text[i++];
          } else {
            token += text[i++];
          }
        }
        i++;
      } else if (c === "\\" && i + 1 < text.length) {
        i++;
        token += text[i++];
      } else {
        token += text[i++];
      }
    }
    tokens.push(token);
  }
  return tokens;
}

const METHODS: HTTPMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

/** cURL 명령을 파싱한다. 파싱 불가(빈 입력/URL 없음) 시 에러를 던진다. */
export function parseCurl(input: string): ParsedCurl {
  const tokens = tokenizeCurl(input);
  if (tokens.length === 0 || tokens[0] !== "curl") {
    throw new Error("‘curl’로 시작하는 명령이 아닙니다.");
  }

  let method: HTTPMethod | null = null;
  let url = "";
  const headers: { key: string; value: string }[] = [];
  let body = "";
  const dataParts: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    const next = () => tokens[++i] ?? "";
    if (t === "-X" || t === "--request") {
      const m = next().toUpperCase();
      if ((METHODS as string[]).includes(m)) method = m as HTTPMethod;
    } else if (t === "-H" || t === "--header") {
      const h = next();
      const idx = h.indexOf(":");
      if (idx > 0) {
        headers.push({ key: h.slice(0, idx).trim(), value: h.slice(idx + 1).trim() });
      }
    } else if (
      t === "-d" ||
      t === "--data" ||
      t === "--data-raw" ||
      t === "--data-binary" ||
      t === "--data-urlencode"
    ) {
      dataParts.push(next());
    } else if (t === "-u" || t === "--user") {
      const cred = next();
      headers.push({ key: "Authorization", value: `Basic ${btoa(cred)}` });
    } else if (t === "--url") {
      url = next();
    } else if (t === "-G" || t === "--get") {
      method = "GET";
    } else if (t.startsWith("-")) {
      // 값을 받는 기타 플래그는 건너뛴다(부수효과 방지). 알려진 무인자 플래그는 무시.
      if (["-L", "--location", "-k", "--insecure", "-s", "--silent", "-v"].includes(t)) continue;
      // 알 수 없는 플래그가 값을 가질 수 있으나, 안전하게 단독 무시
    } else if (!url) {
      url = t;
    }
  }

  if (dataParts.length > 0) {
    body = dataParts.join("&");
    if (!method) method = "POST"; // 데이터가 있으면 기본 POST
  }
  if (!method) method = "GET";

  if (!url) throw new Error("URL을 찾을 수 없습니다.");
  return { method, url, headers, body };
}

/** 파싱한 cURL을 ad-hoc 오퍼레이션 + 입력값 + baseURL로 변환한다.
 *  URL이 유효하지 않으면 parseCurl/URL에서 에러를 던진다. */
export function curlToRequest(input: string): {
  operation: ParsedOperation;
  inputs: RequestInputs;
  baseURL: string;
} {
  const c = parseCurl(input);
  const u = new URL(c.url);
  const baseURL = u.origin;

  const queryParams: RequestParam[] = [];
  u.searchParams.forEach((value, key) => queryParams.push({ key, value, enabled: true }));
  const headers: RequestParam[] = c.headers.map((h) => ({
    key: h.key,
    value: h.value,
    enabled: true,
  }));
  const contentType =
    c.headers.find((h) => h.key.toLowerCase() === "content-type")?.value ?? "application/json";

  const operation: ParsedOperation = {
    id: `curl:${c.method} ${u.pathname}`,
    method: c.method,
    path: u.pathname || "/",
    tags: ["cURL"],
    summary: "cURL import",
    parameters: [],
    requestBody: c.body ? { required: false, contentType } : undefined,
    responses: [],
  };
  const inputs: RequestInputs = {
    pathParams: {},
    queryParams,
    headers,
    body: c.body,
  };
  return { operation, inputs, baseURL };
}
