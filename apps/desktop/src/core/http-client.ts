// Tauri HTTP 플러그인을 통한 요청(웹뷰 CORS 우회 — 임의 호스트 호출 가능).
import { fetch } from "@tauri-apps/plugin-http";
import type { HTTPRequest, HTTPResponse } from "./types";

export async function executeRequest(
  request: HTTPRequest,
  options: { timeoutMs?: number } = {},
): Promise<HTTPResponse> {
  const start = performance.now();
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body:
        request.body && request.body.length > 0 && request.method !== "GET"
          ? request.body
          : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    const durationMs = Math.round(performance.now() - start);

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      statusCode: response.status,
      headers,
      body: text,
      durationMs,
      size: new TextEncoder().encode(text).length,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`요청 시간이 초과되었습니다 (${timeoutMs / 1000}초).`);
    }
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timer);
  }
}

/** spec URL에서 OpenAPI 문서 텍스트를 가져온다(HTML이면 디스커버리 힌트 throw). */
export async function fetchSpecText(
  url: string,
  headers: Record<string, string> = {},
): Promise<string> {
  const response = await fetch(url, { method: "GET", headers });
  const text = await response.text();
  if (response.status === 401 || response.status === 403) {
    throw new Error("이 spec URL은 인증이 필요합니다.");
  }
  if (text.trim().startsWith("<")) {
    throw new Error(
      "HTML 페이지를 받았습니다. JSON spec URL을 직접 입력하세요. 예: /v3/api-docs, /openapi.json",
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`spec 요청 실패: HTTP ${response.status}`);
  }
  return text;
}
