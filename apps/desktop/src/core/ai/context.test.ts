import { describe, it, expect } from "vitest";
import { buildAiContext } from "./context";
import type { ParsedOperation, HTTPResponse } from "../types";

const op: ParsedOperation = {
  id: "POST /products",
  method: "POST",
  path: "/products",
  operationId: "createProduct",
  summary: "상품 생성",
  description: "새 상품을 등록한다",
  tags: ["product"],
  parameters: [
    { id: "q1", name: "dryRun", location: "query", required: false, schema: { type: "boolean" } },
  ],
  requestBody: {
    required: true,
    contentType: "application/json",
    schema: {
      type: "object",
      properties: { name: { type: "string" }, stock: { type: "integer" } },
      required: ["name"],
    },
  },
  responses: [{ statusCode: "201", description: "생성됨" }],
};

describe("buildAiContext", () => {
  it("엔드포인트 메서드/경로/요약을 포함한다", () => {
    const ctx = buildAiContext({ op, inputs: null, response: null, envVarNames: [], baseURL: "https://api.x" });
    expect(ctx).toContain("POST /products");
    expect(ctx).toContain("상품 생성");
    expect(ctx).toContain("https://api.x");
  });

  it("요청 스키마(필드명/필수)를 포함한다", () => {
    const ctx = buildAiContext({ op, inputs: null, response: null, envVarNames: [], baseURL: "" });
    expect(ctx).toContain("name");
    expect(ctx).toContain("stock");
  });

  it("환경변수는 이름만 넣고 값은 넣지 않는다", () => {
    const ctx = buildAiContext({
      op,
      inputs: null,
      response: null,
      envVarNames: ["TOKEN", "USER_ID"],
      baseURL: "",
    });
    expect(ctx).toContain("TOKEN");
    expect(ctx).toContain("USER_ID");
    expect(ctx).not.toContain("secret-value");
  });

  it("직전 응답이 있으면 상태코드와 본문 일부를 포함한다", () => {
    const response: HTTPResponse = {
      statusCode: 401,
      headers: {},
      body: '{"error":"unauthorized"}',
      durationMs: 12,
      size: 24,
    };
    const ctx = buildAiContext({ op, inputs: null, response, envVarNames: [], baseURL: "" });
    expect(ctx).toContain("401");
    expect(ctx).toContain("unauthorized");
  });

  it("매우 긴 응답 본문은 잘라낸다(2000자 이하)", () => {
    const response: HTTPResponse = {
      statusCode: 200,
      headers: {},
      body: "x".repeat(5000),
      durationMs: 1,
      size: 5000,
    };
    const ctx = buildAiContext({ op, inputs: null, response, envVarNames: [], baseURL: "" });
    expect(ctx.length).toBeLessThan(4000);
  });
});
