// HTTP는 Rust(reqwest) 커맨드로 처리한다.
// 웹뷰 fetch는 CORS/스코프 제약이 있어 임의 호스트 호출이 불가하므로, API 클라이언트 목적상 Rust로 보낸다.
import { invoke } from "@tauri-apps/api/core";
import type { HTTPRequest, HTTPResponse } from "./types";

interface RawHttpResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  size: number;
}

export async function executeRequest(
  request: HTTPRequest,
  options: { timeoutMs?: number } = {},
): Promise<HTTPResponse> {
  const result = await invoke<RawHttpResult>("http_request", {
    args: {
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.method === "GET" ? undefined : request.body,
      timeoutMs: options.timeoutMs ?? 30_000,
    },
  });
  return {
    statusCode: result.status,
    headers: result.headers,
    body: result.body,
    durationMs: result.durationMs,
    size: result.size,
  };
}

/** 저수준 GET (spec 로드/디스커버리 probe 용). 상태코드와 본문만 반환. */
export async function rawGet(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  const result = await invoke<RawHttpResult>("http_request", {
    args: { method: "GET", url, headers, body: undefined, timeoutMs: 15_000 },
  });
  return { status: result.status, body: result.body };
}
