import { describe, it, expect } from "vitest";
import {
  validateAgainstSchema,
  validateResponseBody,
  validateRequestInputs,
} from "./schema-validate";
import type { ParsedOperation, ParsedSchema } from "./types";

const userSchema: ParsedSchema = {
  type: "object",
  required: ["id", "name"],
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    role: { type: "string", enumValues: ["admin", "user"] },
    tags: { type: "array", items: { type: "string" } },
  },
};

describe("validateAgainstSchema", () => {
  it("유효한 객체는 이슈 없음", () => {
    expect(
      validateAgainstSchema({ id: 1, name: "kim", role: "admin", tags: ["a"] }, userSchema),
    ).toEqual([]);
  });

  it("필수 누락 + 타입 불일치 + enum 위반 + 배열요소 타입", () => {
    const issues = validateAgainstSchema(
      { name: 123, role: "ghost", tags: ["ok", 5] },
      userSchema,
    );
    const paths = issues.map((i) => i.path);
    expect(paths).toContain("$.id"); // 필수 누락
    expect(paths).toContain("$.name"); // string 기대
    expect(paths).toContain("$.role"); // enum 위반
    expect(paths).toContain("$.tags[1]"); // 배열 요소 타입
  });

  it("object 기대 위치에 배열이면 이슈", () => {
    expect(validateAgainstSchema([], userSchema)[0].message).toMatch(/object 기대/);
  });

  it("스키마 없으면 이슈 없음", () => {
    expect(validateAgainstSchema({ x: 1 }, undefined)).toEqual([]);
  });
});

function op(p: Partial<ParsedOperation>): ParsedOperation {
  return { id: "GET /x", method: "GET", path: "/x", tags: [], parameters: [], responses: [], ...p };
}

describe("validateResponseBody", () => {
  const operation = op({
    responses: [{ statusCode: "200", schema: userSchema }, { statusCode: "default", schema: { type: "object" } }],
  });

  it("200 스키마로 검증", () => {
    expect(validateResponseBody(operation, 200, JSON.stringify({ id: 1, name: "a" }))).toEqual([]);
    expect(validateResponseBody(operation, 200, JSON.stringify({ id: 1 })).length).toBe(1);
  });

  it("JSON 아니면 이슈", () => {
    expect(validateResponseBody(operation, 200, "oops")[0].message).toMatch(/JSON/);
  });

  it("스키마 없는 상태코드는 default로 폴백", () => {
    expect(validateResponseBody(operation, 404, "[]")[0].message).toMatch(/object 기대/);
  });
});

describe("validateRequestInputs", () => {
  const operation = op({
    method: "POST",
    parameters: [
      { id: "1", name: "id", location: "path", required: true },
      { id: "2", name: "q", location: "query", required: true },
    ],
    requestBody: { required: true, contentType: "application/json" },
  });

  it("필수 누락을 모두 보고", () => {
    const issues = validateRequestInputs(operation, {
      pathParams: { id: "" },
      queryParams: [{ key: "q", value: "", enabled: true }],
      headers: [],
      body: "",
      bodyMode: "raw",
    });
    expect(issues.map((i) => i.path).sort()).toEqual(["body", "id", "q"]);
  });

  it("모두 채우면 이슈 없음", () => {
    const issues = validateRequestInputs(operation, {
      pathParams: { id: "5" },
      queryParams: [{ key: "q", value: "x", enabled: true }],
      headers: [],
      body: "{}",
      bodyMode: "raw",
    });
    expect(issues).toEqual([]);
  });
});
