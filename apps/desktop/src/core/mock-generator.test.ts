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

// ────────────────────────────────────────────────
// Task 2: 필드명/포맷 도메인 인식
// ────────────────────────────────────────────────

describe("generateFromSchema — 문자열 포맷 인식", () => {
  it("format=date-time → ISO 8601 형식 반환", () => {
    const schema: ParsedSchema = { type: "string", format: "date-time" };
    const result = generateFromSchema(schema, { seed: 1 }) as string;
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("format=date → YYYY-MM-DD 형식 반환", () => {
    const schema: ParsedSchema = { type: "string", format: "date" };
    const result = generateFromSchema(schema, { seed: 1 }) as string;
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("format=email → 이메일 형식 반환", () => {
    const schema: ParsedSchema = { type: "string", format: "email" };
    const result = generateFromSchema(schema, { seed: 1 }) as string;
    expect(result).toMatch(/@/);
  });

  it("format=uuid → UUID v4 형식 반환", () => {
    const schema: ParsedSchema = { type: "string", format: "uuid" };
    const result = generateFromSchema(schema, { seed: 1 }) as string;
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("format=uri → https URL 반환", () => {
    const schema: ParsedSchema = { type: "string", format: "uri" };
    const result = generateFromSchema(schema, { seed: 1 }) as string;
    expect(result).toMatch(/^https?:\/\//);
  });

  it("format=url → https URL 반환", () => {
    const schema: ParsedSchema = { type: "string", format: "url" };
    const result = generateFromSchema(schema, { seed: 1 }) as string;
    expect(result).toMatch(/^https?:\/\//);
  });
});

describe("generateFromSchema — 문자열 필드명 도메인 인식", () => {
  it("fieldName=email → 이메일 형식 반환", () => {
    const schema: ParsedSchema = { type: "string" };
    const result = generateFromSchema(schema, { seed: 1, fieldName: "email" }) as string;
    expect(result).toMatch(/@/);
  });

  it("fieldName=userEmail → 이메일 형식 반환", () => {
    const schema: ParsedSchema = { type: "string" };
    const result = generateFromSchema(schema, { seed: 1, fieldName: "userEmail" }) as string;
    expect(result).toMatch(/@/);
  });

  it("fieldName=name → 한국어 이름 반환 (비어있지 않음)", () => {
    const schema: ParsedSchema = { type: "string" };
    const result = generateFromSchema(schema, { seed: 1, fieldName: "name" }) as string;
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("fieldName=username → 한국어 이름 반환", () => {
    const schema: ParsedSchema = { type: "string" };
    const result = generateFromSchema(schema, { seed: 2, fieldName: "username" }) as string;
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("fieldName=createdAt → ISO 날짜 형식 반환", () => {
    const schema: ParsedSchema = { type: "string" };
    const result = generateFromSchema(schema, { seed: 1, fieldName: "createdAt" }) as string;
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("fieldName=updatedDate → ISO 날짜 형식 반환", () => {
    const schema: ParsedSchema = { type: "string" };
    const result = generateFromSchema(schema, { seed: 1, fieldName: "updatedDate" }) as string;
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("fieldName=phone → 010-xxxx-xxxx 형식 반환", () => {
    const schema: ParsedSchema = { type: "string" };
    const result = generateFromSchema(schema, { seed: 1, fieldName: "phone" }) as string;
    expect(result).toMatch(/^010-\d{4}-\d{4}$/);
  });

  it("fieldName=mobile → 010-xxxx-xxxx 형식 반환", () => {
    const schema: ParsedSchema = { type: "string" };
    const result = generateFromSchema(schema, { seed: 1, fieldName: "mobile" }) as string;
    expect(result).toMatch(/^010-\d{4}-\d{4}$/);
  });

  it("fieldName=imageUrl → https URL 반환", () => {
    const schema: ParsedSchema = { type: "string" };
    const result = generateFromSchema(schema, { seed: 1, fieldName: "imageUrl" }) as string;
    expect(result).toMatch(/^https?:\/\//);
  });

  it("fieldName=photoUrl → https URL 반환", () => {
    const schema: ParsedSchema = { type: "string" };
    const result = generateFromSchema(schema, { seed: 1, fieldName: "photoUrl" }) as string;
    expect(result).toMatch(/^https?:\/\//);
  });

  it("fieldName=address → 한국 주소 문자열 반환 (비어있지 않음)", () => {
    const schema: ParsedSchema = { type: "string" };
    const result = generateFromSchema(schema, { seed: 1, fieldName: "address" }) as string;
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("fieldName=description → 설명 문구 반환 (비어있지 않음)", () => {
    const schema: ParsedSchema = { type: "string" };
    const result = generateFromSchema(schema, { seed: 1, fieldName: "description" }) as string;
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("format이 fieldName보다 우선순위가 높다 (format=email vs fieldName=name)", () => {
    const schema: ParsedSchema = { type: "string", format: "email" };
    const result = generateFromSchema(schema, { seed: 1, fieldName: "name" }) as string;
    expect(result).toMatch(/@/);
  });

  it("모든 필드명 인식은 결정적이다 (같은 시드 = 같은 결과)", () => {
    const schema: ParsedSchema = { type: "string" };
    const opts1: GenerateOptions = { seed: 5, fieldName: "email" };
    const opts2: GenerateOptions = { seed: 5, fieldName: "email" };
    expect(generateFromSchema(schema, opts1)).toBe(generateFromSchema(schema, opts2));
  });
});

describe("generateFromSchema — 정수 필드명 도메인 인식", () => {
  it("fieldName=id, index=0 → 1 반환 (순번)", () => {
    const schema: ParsedSchema = { type: "integer" };
    expect(generateFromSchema(schema, { seed: 1, fieldName: "id", index: 0 })).toBe(1);
  });

  it("fieldName=userId, index=2 → 3 반환 (순번)", () => {
    const schema: ParsedSchema = { type: "integer" };
    expect(generateFromSchema(schema, { seed: 1, fieldName: "userId", index: 2 })).toBe(3);
  });

  it("fieldName=petId, index=undefined → 1 반환 (index 기본값 0)", () => {
    const schema: ParsedSchema = { type: "integer" };
    expect(generateFromSchema(schema, { seed: 1, fieldName: "petId" })).toBe(1);
  });

  it("fieldName=price → 1000 단위 금액 반환", () => {
    const schema: ParsedSchema = { type: "integer" };
    const result = generateFromSchema(schema, { seed: 1, fieldName: "price" }) as number;
    expect(result % 1000).toBe(0);
    expect(result).toBeGreaterThan(0);
  });

  it("fieldName=amount → 1000 단위 금액 반환", () => {
    const schema: ParsedSchema = { type: "integer" };
    const result = generateFromSchema(schema, { seed: 1, fieldName: "amount" }) as number;
    expect(result % 1000).toBe(0);
  });

  it("fieldName=count → 0~99 범위 반환", () => {
    const schema: ParsedSchema = { type: "integer" };
    const result = generateFromSchema(schema, { seed: 1, fieldName: "count" }) as number;
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(99);
  });

  it("fieldName=age → 20~69 범위 반환", () => {
    const schema: ParsedSchema = { type: "integer" };
    const result = generateFromSchema(schema, { seed: 1, fieldName: "age" }) as number;
    expect(result).toBeGreaterThanOrEqual(20);
    expect(result).toBeLessThanOrEqual(69);
  });

  it("그 외 필드명 → 1~1000 범위 반환", () => {
    const schema: ParsedSchema = { type: "integer" };
    const result = generateFromSchema(schema, { seed: 1, fieldName: "someRandomField" }) as number;
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(1000);
  });

  it("정수 필드명 인식도 결정적이다", () => {
    const schema: ParsedSchema = { type: "integer" };
    const r1 = generateFromSchema(schema, { seed: 7, fieldName: "price" });
    const r2 = generateFromSchema(schema, { seed: 7, fieldName: "price" });
    expect(r1).toBe(r2);
  });
});
