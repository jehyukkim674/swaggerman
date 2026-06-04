import { describe, it, expect } from "vitest";
import { schemaTypeLabel } from "./schema-format";
import type { ParsedSchema } from "./types";

describe("schemaTypeLabel", () => {
  it("스키마가 없으면 any", () => {
    expect(schemaTypeLabel(undefined)).toBe("any");
  });

  it("일반 string은 string", () => {
    expect(schemaTypeLabel({ type: "string" })).toBe("string");
  });

  it("enum string은 따옴표로 묶어 union으로 표시", () => {
    expect(
      schemaTypeLabel({ type: "string", enumValues: ["a", "b"] }),
    ).toBe('"a" | "b"');
  });

  it("enum이 빈 배열이면 일반 string", () => {
    expect(schemaTypeLabel({ type: "string", enumValues: [] })).toBe("string");
  });

  it("array는 items 타입을 포함", () => {
    const schema: ParsedSchema = { type: "array", items: { type: "integer" } };
    expect(schemaTypeLabel(schema)).toBe("array[integer]");
  });

  it("items 없는 array는 그냥 array", () => {
    expect(schemaTypeLabel({ type: "array" })).toBe("array");
  });

  it("object는 object", () => {
    expect(schemaTypeLabel({ type: "object" })).toBe("object");
  });

  it("그 외 타입은 그대로 반환", () => {
    expect(schemaTypeLabel({ type: "boolean" })).toBe("boolean");
    expect(schemaTypeLabel({ type: "number" })).toBe("number");
  });

  it("중첩 array는 재귀적으로 라벨링", () => {
    const schema: ParsedSchema = {
      type: "array",
      items: { type: "array", items: { type: "string" } },
    };
    expect(schemaTypeLabel(schema)).toBe("array[array[string]]");
  });
});
