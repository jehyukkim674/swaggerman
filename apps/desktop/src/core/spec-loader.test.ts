import { describe, it, expect, vi, beforeEach } from "vitest";

// http-client.rawGet 모킹: URL별 응답 테이블
const table: Record<string, { status: number; body: string }> = {};
vi.mock("./http-client", () => ({
  rawGet: vi.fn(async (url: string) => table[url] ?? { status: 404, body: "" }),
}));

import { loadSpec } from "./spec-loader";

const VALID_SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "T", version: "1" },
  paths: { "/ping": { get: { responses: { "200": { description: "OK" } } } } },
});

const HTML = "<!DOCTYPE html><html><body>Swagger UI</body></html>";

beforeEach(() => {
  for (const k of Object.keys(table)) delete table[k];
});

describe("loadSpec", () => {
  it("JSON spec URL을 직접 파싱", async () => {
    table["http://x/v3/api-docs"] = { status: 200, body: VALID_SPEC };
    const spec = await loadSpec("http://x/v3/api-docs");
    expect(spec.info.title).toBe("T");
    expect(spec.operations).toHaveLength(1);
  });

  it("HTML이면 well-known 디스커버리로 spec 발견", async () => {
    table["http://x/swagger-ui/index.html"] = { status: 200, body: HTML };
    table["http://x/v3/api-docs"] = { status: 200, body: VALID_SPEC };
    const spec = await loadSpec("http://x/swagger-ui/index.html");
    expect(spec.operations[0].id).toBe("GET /ping");
  });

  it("401 decoy가 있어도 유효 spec 우선", async () => {
    table["http://x/swagger-ui/index.html"] = { status: 200, body: HTML };
    table["http://x/openapi.json"] = { status: 401, body: "" };
    table["http://x/api-docs"] = { status: 401, body: "" };
    table["http://x/v3/api-docs"] = { status: 200, body: VALID_SPEC };
    const spec = await loadSpec("http://x/swagger-ui/index.html");
    expect(spec.info.title).toBe("T");
  });

  it("모든 후보가 401 → 인증 필요 에러", async () => {
    table["http://x/swagger-ui/index.html"] = { status: 200, body: HTML };
    // 모든 well-known/config는 401
    for (const p of [
      "/v3/api-docs",
      "/openapi.json",
      "/openapi.yaml",
      "/v2/api-docs",
      "/api-docs",
      "/swagger.json",
      "/api/schema/",
      "/api/openapi.json",
      "/api/swagger.json",
      "/swagger/v1/swagger.json",
      "/v3/api-docs/swagger-config",
      "/swagger-ui/swagger-config",
    ]) {
      table[`http://x${p}`] = { status: 401, body: "" };
    }
    await expect(loadSpec("http://x/swagger-ui/index.html")).rejects.toThrow("인증");
  });

  it("직접 URL이 401 → 인증 필요 에러", async () => {
    table["http://x/v3/api-docs"] = { status: 401, body: "" };
    await expect(loadSpec("http://x/v3/api-docs")).rejects.toThrow("인증");
  });
});
