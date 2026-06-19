import { describe, it, expect } from "vitest";
import { buildRoutePrompt, parseRouteId, type RouteOp } from "./route";

const OPS: RouteOp[] = [
  { id: "GET /orders", method: "GET", path: "/orders", summary: "주문 목록", tags: ["orders"] },
  { id: "GET /orders/{id}", method: "GET", path: "/orders/{id}", summary: "주문 단건" },
  { id: "POST /users", method: "POST", path: "/users", summary: "회원 생성" },
];
const IDS = OPS.map((o) => o.id);

describe("buildRoutePrompt", () => {
  const p = buildRoutePrompt(OPS, "최근 주문 목록 보여줘");
  it("의도와 엔드포인트·요약을 포함", () => {
    expect(p).toContain("최근 주문 목록 보여줘");
    expect(p).toContain("GET /orders");
    expect(p).toContain("주문 목록");
  });
  it("태그를 포함", () => expect(p).toContain("[orders]"));
});

describe("parseRouteId", () => {
  it("JSON operationId를 추출", () => {
    expect(parseRouteId('{"operationId":"GET /orders","reason":"x"}', IDS)).toBe("GET /orders");
  });
  it("코드펜스로 감싼 JSON도 처리", () => {
    expect(parseRouteId('```json\n{"operationId":"POST /users"}\n```', IDS)).toBe("POST /users");
  });
  it("JSON이 아니면 본문에서 유효 id 매칭(가장 긴 것 우선)", () => {
    expect(parseRouteId("아마도 GET /orders/{id} 가 맞습니다", IDS)).toBe("GET /orders/{id}");
  });
  it("유효하지 않은 id는 null", () => {
    expect(parseRouteId('{"operationId":"DELETE /nope"}', IDS)).toBeNull();
  });
  it("아무것도 못 찾으면 null", () => {
    expect(parseRouteId("모르겠어요", IDS)).toBeNull();
  });
});
