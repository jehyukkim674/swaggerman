import { describe, it, expect } from "vitest";
import { buildGuideMarkdown } from "./guide-export";
import type { ParsedSpec, ParsedOperation } from "./types";
import type { HistoryItem } from "./history";

const op: ParsedOperation = {
  id: "GET /pet/findByStatus", method: "GET", path: "/pet/findByStatus",
  summary: "Finds Pets by status.", description: "상태로 조회",
  tags: [], parameters: [{ id: "1", name: "status", location: "query", required: true, schema: { type: "string" } }],
  responses: [{ statusCode: "200", description: "ok" }],
};
const spec = { info: { title: "Petstore", version: "1" }, operations: [op], securitySchemes: [] } as unknown as ParsedSpec;

function hist(over: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: "h1", opId: "GET /pet/findByStatus", method: "GET", path: "/pet/findByStatus",
    url: "https://api.test/pet/findByStatus?status=sold", status: 200, durationMs: 10, size: 0,
    executedAt: 100,
    inputs: { pathParams: {}, queryParams: [{ key: "status", value: "sold", enabled: true }], headers: [{ key: "Authorization", value: "Bearer SECRET", enabled: true }, { key: "Accept", value: "application/json", enabled: true }], body: "" },
    responseHeaders: {}, responseBody: '[{"id":1,"name":"코코"}]',
    ...over,
  };
}

describe("buildGuideMarkdown", () => {
  it("문서 제목과 operation 섹션 헤더를 만든다", () => {
    const md = buildGuideMarkdown(spec, ["GET /pet/findByStatus"], [], "https://api.test");
    expect(md).toContain("# Petstore 연동 가이드");
    expect(md).toContain("## GET /pet/findByStatus — Finds Pets by status.");
    expect(md).toContain("상태로 조회");
  });
  it("파라미터 표를 만든다", () => {
    const md = buildGuideMarkdown(spec, ["GET /pet/findByStatus"], [], "https://api.test");
    expect(md).toContain("| status | query | 필수 | string |");
  });
  it("요청 예시 cURL을 포함하고 민감 헤더는 제외한다", () => {
    const md = buildGuideMarkdown(spec, ["GET /pet/findByStatus"], [hist()], "https://api.test");
    expect(md).toContain("curl -X GET");
    expect(md).toContain("Accept: application/json");
    expect(md).not.toContain("SECRET"); // Authorization 제외
  });
  it("응답 예시는 히스토리 responseBody를 우선 사용한다", () => {
    const md = buildGuideMarkdown(spec, ["GET /pet/findByStatus"], [hist()], "https://api.test");
    expect(md).toContain("코코");
    expect(md).toContain("**응답 예시**");
  });
  it("히스토리 없으면 응답 예시 섹션 생략(스펙 example도 없을 때)", () => {
    const md = buildGuideMarkdown(spec, ["GET /pet/findByStatus"], [], "https://api.test");
    expect(md).not.toContain("**응답 예시**");
  });
});
