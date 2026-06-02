// mock-generator.ts 단위 테스트
// Node 환경 순수 로직 테스트 (jsdom 불필요)

import { describe, it, expect } from "vitest";
import {
  mulberry32,
  hashString,
  generateFromSchema,
} from "./mock-generator";
import type { GenerateOptions } from "./mock-generator";
import type { ParsedSchema } from "./types";

const baseOpts: GenerateOptions = { seed: 42 };

// ────────────────────────────────────────────────
// Task 1: 시드 PRNG + 기본 타입 생성
// ────────────────────────────────────────────────

describe("mulberry32", () => {
  it("0과 1 사이의 숫자를 반환한다", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 20; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("같은 시드는 항상 같은 시퀀스를 생성한다", () => {
    const a = mulberry32(99);
    const b = mulberry32(99);
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b());
    }
  });

  it("다른 시드는 다른 시퀀스를 생성한다", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });
});

describe("hashString", () => {
  it("같은 문자열은 항상 같은 숫자를 반환한다", () => {
    expect(hashString("hello")).toBe(hashString("hello"));
    expect(hashString("name")).toBe(hashString("name"));
  });

  it("다른 문자열은 다른 숫자를 반환한다 (높은 확률)", () => {
    expect(hashString("hello")).not.toBe(hashString("world"));
    expect(hashString("name")).not.toBe(hashString("email"));
  });

  it("빈 문자열도 숫자를 반환한다", () => {
    expect(typeof hashString("")).toBe("number");
  });
});

describe("generateFromSchema — 기본 타입 생성", () => {
  it("string 스키마 → 문자열을 반환한다", () => {
    const result = generateFromSchema({ type: "string" }, baseOpts);
    expect(typeof result).toBe("string");
  });

  it("integer 스키마 → 정수를 반환한다", () => {
    const result = generateFromSchema({ type: "integer" }, baseOpts);
    expect(typeof result).toBe("number");
    expect(Number.isInteger(result)).toBe(true);
  });

  it("number 스키마 → 숫자를 반환한다", () => {
    const result = generateFromSchema({ type: "number" }, baseOpts);
    expect(typeof result).toBe("number");
  });

  it("boolean 스키마 → 불리언을 반환한다", () => {
    const result = generateFromSchema({ type: "boolean" }, baseOpts);
    expect(typeof result).toBe("boolean");
  });

  it("enumValues가 있으면 그 중 하나를 반환한다", () => {
    const schema: ParsedSchema = { type: "string", enumValues: ["A", "B", "C"] };
    const result = generateFromSchema(schema, baseOpts);
    expect(["A", "B", "C"]).toContain(result);
  });

  it("example이 있으면 string 타입은 그대로 반환한다", () => {
    const schema: ParsedSchema = { type: "string", example: "hello-example" };
    expect(generateFromSchema(schema, baseOpts)).toBe("hello-example");
  });

  it("example이 있으면 integer 타입은 Number로 변환한다", () => {
    const schema: ParsedSchema = { type: "integer", example: "123" };
    const result = generateFromSchema(schema, baseOpts);
    expect(result).toBe(123);
    expect(Number.isInteger(result)).toBe(true);
  });

  it("example이 있으면 number 타입은 Number로 변환한다", () => {
    const schema: ParsedSchema = { type: "number", example: "3.14" };
    expect(generateFromSchema(schema, baseOpts)).toBe(3.14);
  });

  it("example이 있으면 boolean 타입은 boolean으로 변환한다", () => {
    const trueSchema: ParsedSchema = { type: "boolean", example: "true" };
    const falseSchema: ParsedSchema = { type: "boolean", example: "false" };
    expect(generateFromSchema(trueSchema, baseOpts)).toBe(true);
    expect(generateFromSchema(falseSchema, baseOpts)).toBe(false);
  });

  it("object 스키마 → properties를 채운 객체를 반환한다", () => {
    const schema: ParsedSchema = {
      type: "object",
      properties: {
        id: { type: "integer" },
        name: { type: "string" },
      },
    };
    const result = generateFromSchema(schema, baseOpts) as Record<string, unknown>;
    expect(typeof result).toBe("object");
    expect(typeof result.id).toBe("number");
    expect(typeof result.name).toBe("string");
  });

  it("object 스키마의 각 프로퍼티는 시드가 분기되어 결정적으로 생성된다", () => {
    const schema: ParsedSchema = {
      type: "object",
      properties: {
        a: { type: "integer" },
        b: { type: "integer" },
      },
    };
    const r1 = generateFromSchema(schema, { seed: 100 }) as Record<string, unknown>;
    const r2 = generateFromSchema(schema, { seed: 100 }) as Record<string, unknown>;
    expect(r1).toEqual(r2);
  });

  it("array 스키마 → items 타입의 배열 3개를 반환한다", () => {
    const schema: ParsedSchema = { type: "array", items: { type: "integer" } };
    const result = generateFromSchema(schema, baseOpts) as unknown[];
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
    result.forEach((v) => expect(typeof v).toBe("number"));
  });

  it("같은 시드는 같은 결과, 다른 시드는 다른 결과 (결정적)", () => {
    const schema: ParsedSchema = { type: "string" };
    const r1 = generateFromSchema(schema, { seed: 7 });
    const r2 = generateFromSchema(schema, { seed: 7 });
    const r3 = generateFromSchema(schema, { seed: 8 });
    expect(r1).toBe(r2);
    expect(r1).not.toBe(r3);
  });

  it("undefined 스키마 → null을 반환한다", () => {
    expect(generateFromSchema(undefined, baseOpts)).toBeNull();
  });
});
