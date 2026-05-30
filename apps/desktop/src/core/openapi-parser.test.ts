import { describe, it, expect } from "vitest";
import { parseSpec, parseSpecText } from "./openapi-parser";

const SPEC = {
  openapi: "3.0.1",
  info: { title: "Test API", version: "1.2.3", description: "desc" },
  servers: [{ url: "https://api.test.com" }],
  paths: {
    "/users/{id}": {
      get: {
        operationId: "getUser",
        summary: "사용자 조회",
        tags: ["users"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "verbose", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          "404": { description: "Not found" },
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
          },
        },
      },
    },
    "/users": {
      post: {
        tags: ["users"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/User" },
              example: { id: 1, name: "Alice" },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
  },
  components: {
    schemas: {
      User: {
        type: "object",
        required: ["id", "name"],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          role: { type: "string", enum: ["admin", "user"] },
        },
      },
    },
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
      apiKey: { type: "apiKey", name: "X-API-Key", in: "header" },
    },
  },
};

describe("openapi-parser", () => {
  const spec = parseSpec(SPEC);

  it("info와 servers를 파싱", () => {
    expect(spec.info.title).toBe("Test API");
    expect(spec.info.version).toBe("1.2.3");
    expect(spec.servers).toEqual(["https://api.test.com"]);
  });

  it("operation 수와 메서드/경로", () => {
    expect(spec.operations).toHaveLength(2);
    const get = spec.operations.find((o) => o.id === "GET /users/{id}");
    expect(get?.method).toBe("GET");
    expect(get?.summary).toBe("사용자 조회");
    expect(get?.tags).toEqual(["users"]);
  });

  it("파라미터: path는 required, query는 optional", () => {
    const get = spec.operations.find((o) => o.id === "GET /users/{id}")!;
    const id = get.parameters.find((p) => p.name === "id");
    const verbose = get.parameters.find((p) => p.name === "verbose");
    expect(id?.location).toBe("path");
    expect(id?.required).toBe(true);
    expect(verbose?.location).toBe("query");
    expect(verbose?.required).toBe(false);
  });

  it("$ref 해석 + enum", () => {
    const post = spec.operations.find((o) => o.id === "POST /users")!;
    const schema = post.requestBody?.schema;
    expect(schema?.type).toBe("object");
    expect(schema?.properties?.id.type).toBe("integer");
    expect(schema?.properties?.role.enumValues).toEqual(["admin", "user"]);
    expect(schema?.required).toEqual(["id", "name"]);
  });

  it("requestBody example 캡처", () => {
    const post = spec.operations.find((o) => o.id === "POST /users")!;
    expect(post.requestBody?.example).toEqual({ id: 1, name: "Alice" });
  });

  it("응답은 상태코드 숫자순 정렬", () => {
    const get = spec.operations.find((o) => o.id === "GET /users/{id}")!;
    expect(get.responses.map((r) => r.statusCode)).toEqual(["200", "404"]);
  });

  it("보안 스킴 파싱", () => {
    expect(spec.securitySchemes).toHaveLength(2);
    const bearer = spec.securitySchemes.find((s) => s.name === "bearerAuth");
    const apiKey = spec.securitySchemes.find((s) => s.name === "apiKey");
    expect(bearer?.kind).toEqual({ kind: "http", scheme: "bearer" });
    expect(apiKey?.kind).toEqual({ kind: "apiKey", name: "X-API-Key", location: "header" });
  });

  it("parseSpecText는 JSON 문자열을 파싱", () => {
    const parsed = parseSpecText(JSON.stringify(SPEC));
    expect(parsed.operations).toHaveLength(2);
  });

  it("parseSpecText는 YAML도 파싱", () => {
    const yaml = `
openapi: 3.0.0
info: { title: Y, version: "1" }
paths:
  /ping:
    get:
      responses:
        "200": { description: OK }
`;
    const parsed = parseSpecText(yaml);
    expect(parsed.info.title).toBe("Y");
    expect(parsed.operations[0].id).toBe("GET /ping");
  });
});
