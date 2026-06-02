import { describe, it, expect } from "vitest";
import { buildMockDatasetPrompt, parseMockDatasetResponse, MOCK_DATASET_SYSTEM } from "./mock-prompt";
import type { ParsedOperation } from "../types";

// ────────────────────────────────────────────────
// 테스트 픽스처
// ────────────────────────────────────────────────

/** 상품 목록 조회 operation 픽스처 */
function makeProductListOp(): ParsedOperation {
  return {
    id: "GET /products",
    method: "GET",
    path: "/products",
    summary: "상품 목록 조회",
    tags: ["products"],
    parameters: [],
    responses: [
      {
        statusCode: "200",
        schema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              productId: { type: "integer" },
              name: { type: "string" },
              price: { type: "integer" },
              status: {
                type: "string",
                enumValues: ["ACTIVE", "INACTIVE", "SOLD_OUT"],
              },
            },
          },
        },
      },
    ],
  };
}

/** summary 없는 단순 operation 픽스처 */
function makeSimpleOp(): ParsedOperation {
  return {
    id: "GET /users",
    method: "GET",
    path: "/users",
    tags: [],
    parameters: [],
    responses: [
      {
        statusCode: "200",
        schema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              email: { type: "string", format: "email" },
            },
          },
        },
      },
    ],
  };
}

// ────────────────────────────────────────────────
// MOCK_DATASET_SYSTEM 상수 테스트
// ────────────────────────────────────────────────

describe("MOCK_DATASET_SYSTEM", () => {
  it("시스템 프롬프트는 비어있지 않고 JSON 배열 출력 지시를 담는다", () => {
    expect(MOCK_DATASET_SYSTEM.length).toBeGreaterThan(0);
    expect(MOCK_DATASET_SYSTEM).toMatch(/JSON/);
    expect(MOCK_DATASET_SYSTEM).toMatch(/배열|array/i);
  });
});

// ────────────────────────────────────────────────
// buildMockDatasetPrompt 테스트
// ────────────────────────────────────────────────

describe("buildMockDatasetPrompt", () => {
  it("경로·메서드·summary·필드명·enum 값·개수를 프롬프트에 포함한다", () => {
    const op = makeProductListOp();
    const prompt = buildMockDatasetPrompt(op, 10);

    // 경로 및 메서드
    expect(prompt).toContain("GET");
    expect(prompt).toContain("/products");

    // summary
    expect(prompt).toContain("상품 목록 조회");

    // 필드명
    expect(prompt).toContain("productId");
    expect(prompt).toContain("name");
    expect(prompt).toContain("price");
    expect(prompt).toContain("status");

    // enum 값
    expect(prompt).toContain("ACTIVE");
    expect(prompt).toContain("INACTIVE");
    expect(prompt).toContain("SOLD_OUT");

    // 개수 지시
    expect(prompt).toContain("10개");
  });

  it("summary가 없으면 프롬프트에 summary 행이 없다", () => {
    const op = makeSimpleOp();
    const prompt = buildMockDatasetPrompt(op, 5);

    // 경로는 있어야 함
    expect(prompt).toContain("GET");
    expect(prompt).toContain("/users");

    // summary 행은 없어야 함
    expect(prompt).not.toContain("설명:");

    // 개수 지시 있음
    expect(prompt).toContain("5개");
  });

  it("format이 있는 필드는 format 정보를 포함한다", () => {
    const op = makeSimpleOp();
    const prompt = buildMockDatasetPrompt(op, 3);

    expect(prompt).toContain("email");
    expect(prompt).toContain("format: email");
  });

  it("enum 정의된 필드는 enum 값만 사용하라는 요구사항을 포함한다", () => {
    const op = makeProductListOp();
    const prompt = buildMockDatasetPrompt(op, 10);

    expect(prompt).toMatch(/enum.*정의된.*값만|정의된.*enum.*값만/);
  });

  it("id류 필드는 서로 다른 값을 요구하는 지시를 포함한다", () => {
    const op = makeProductListOp();
    const prompt = buildMockDatasetPrompt(op, 10);

    expect(prompt).toMatch(/식별자|id.*서로 다른|서로 다른.*id/i);
  });
});

// ────────────────────────────────────────────────
// parseMockDatasetResponse 테스트
// ────────────────────────────────────────────────

describe("parseMockDatasetResponse", () => {
  it("순수 JSON 배열 응답을 파싱한다", () => {
    const text = JSON.stringify([{ id: 1, name: "홍길동" }, { id: 2, name: "김철수" }]);
    const result = parseMockDatasetResponse(text);
    expect(result).toHaveLength(2);
    expect((result[0] as { id: number }).id).toBe(1);
  });

  it("마크다운 코드블록(```json)으로 감싼 배열 응답을 파싱한다", () => {
    const text = "```json\n[{\"id\":1},{\"id\":2}]\n```";
    const result = parseMockDatasetResponse(text);
    expect(result).toHaveLength(2);
  });

  it("마크다운 코드블록(``` 언어 없음)으로 감싼 배열 응답을 파싱한다", () => {
    const text = "```\n[{\"id\":3}]\n```";
    const result = parseMockDatasetResponse(text);
    expect(result).toHaveLength(1);
    expect((result[0] as { id: number }).id).toBe(3);
  });

  it("객체 래핑({'items': [...]}) 응답에서 배열을 추출한다", () => {
    const text = JSON.stringify({ items: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    const result = parseMockDatasetResponse(text);
    expect(result).toHaveLength(3);
  });

  it("객체 래핑({'data': [...]}) 응답에서 배열을 추출한다", () => {
    const text = JSON.stringify({ data: [{ id: 1 }], total: 1 });
    const result = parseMockDatasetResponse(text);
    expect(result).toHaveLength(1);
  });

  it("텍스트 중간에 포함된 배열을 추출한다", () => {
    const text = "생성된 데이터:\n[{\"id\":1,\"name\":\"test\"}]\n이상입니다.";
    const result = parseMockDatasetResponse(text);
    expect(result).toHaveLength(1);
  });

  it("파싱 불가 텍스트에서 Error를 throw한다", () => {
    expect(() => parseMockDatasetResponse("죄송합니다. 데이터를 생성할 수 없습니다.")).toThrow();
  });

  it("코드블록 안에 객체 래핑된 경우도 배열을 반환한다", () => {
    const text = "```json\n{\"results\":[{\"id\":10},{\"id\":11}]}\n```";
    const result = parseMockDatasetResponse(text);
    expect(result).toHaveLength(2);
  });
});
