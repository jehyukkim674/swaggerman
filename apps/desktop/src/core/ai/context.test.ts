import { describe, it, expect } from "vitest";
import { buildAiContext } from "./context";
import type { ParsedOperation, HTTPResponse } from "../types";
import type { RequestInputs } from "../request-builder";

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

  // Fix 1: nested object schemas should expand sub-fields recursively
  it("중첩 객체 스키마의 하위 필드를 재귀적으로 펼친다", () => {
    const nestedOp: ParsedOperation = {
      ...op,
      requestBody: {
        required: true,
        contentType: "application/json",
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            address: {
              type: "object",
              properties: {
                city: { type: "string" },
                zip: { type: "string" },
              },
            },
          },
          required: ["name"],
        },
      },
    };
    const ctx = buildAiContext({ op: nestedOp, inputs: null, response: null, envVarNames: [], baseURL: "" });
    expect(ctx).toContain("address");
    expect(ctx).toContain("city");
    expect(ctx).toContain("zip");
  });

  // Fix 2: env var names should appear as {{NAME}} syntax
  it("환경변수는 이름만 {{NAME}} 형식으로 넣고 값은 넣지 않는다", () => {
    const ctx = buildAiContext({
      op,
      inputs: null,
      response: null,
      envVarNames: ["TOKEN", "USER_ID"],
      baseURL: "",
    });
    expect(ctx).toContain("{{TOKEN}}");
    expect(ctx).toContain("{{USER_ID}}");
  });

  // Fix 3: headers are deliberately excluded for security
  it("inputs.headers의 값(인증 토큰 등)은 컨텍스트에 포함되지 않는다", () => {
    const inputs: RequestInputs = {
      pathParams: {},
      queryParams: [],
      headers: [{ key: "Authorization", value: "Bearer super-secret-token", enabled: true }],
      body: "",
      bodyMode: "raw",
      form: [],
    };
    const ctx = buildAiContext({ op, inputs, response: null, envVarNames: [], baseURL: "" });
    expect(ctx).not.toContain("super-secret-token");
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

  // Fix 4: tighten truncation bound to <2500
  it("매우 긴 응답 본문은 잘라낸다(2500자 이하)", () => {
    const response: HTTPResponse = {
      statusCode: 200,
      headers: {},
      body: "x".repeat(5000),
      durationMs: 1,
      size: 5000,
    };
    const ctx = buildAiContext({ op, inputs: null, response, envVarNames: [], baseURL: "" });
    expect(ctx.length).toBeLessThan(2500);
  });
});
