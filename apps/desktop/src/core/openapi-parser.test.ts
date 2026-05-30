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

  it("object query 파라미터를 필드별 query로 펼친다(@ModelAttribute)", () => {
    const s = parseSpec({
      openapi: "3.0.0",
      info: { title: "T", version: "1" },
      components: {
        schemas: {
          SearchReq: {
            type: "object",
            required: ["keyword"],
            properties: {
              keyword: { type: "string" },
              page: { type: "integer" },
              mounted: { type: "boolean" },
            },
          },
        },
      },
      paths: {
        "/search": {
          get: {
            parameters: [
              {
                name: "request",
                in: "query",
                required: true,
                schema: { $ref: "#/components/schemas/SearchReq" },
              },
            ],
            responses: {},
          },
        },
      },
    });
    const op = s.operations[0];
    const q = op.parameters.filter((p) => p.location === "query");
    expect(q.map((p) => p.name).sort()).toEqual(["keyword", "mounted", "page"]);
    expect(q.find((p) => p.name === "keyword")?.required).toBe(true);
    expect(q.find((p) => p.name === "page")?.required).toBe(false);
    // 단일 object "request" 파라미터는 더 이상 없음
    expect(q.find((p) => p.name === "request")).toBeUndefined();
  });

  it("응답 example을 추출(media.example/examples)", () => {
    const s = parseSpec({
      openapi: "3.0.0",
      info: { title: "T", version: "1" },
      paths: {
        "/a": {
          get: {
            responses: {
              "200": {
                description: "ok",
                content: { "application/json": { example: { id: 1 } } },
              },
              "404": {
                description: "nf",
                content: {
                  "application/json": { examples: { e1: { value: { error: "x" } } } },
                },
              },
            },
          },
        },
      },
    });
    const op = s.operations[0];
    expect(op.responses.find((r) => r.statusCode === "200")?.example).toEqual({ id: 1 });
    expect(op.responses.find((r) => r.statusCode === "404")?.example).toEqual({ error: "x" });
  });

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
