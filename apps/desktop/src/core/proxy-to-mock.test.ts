// src/core/proxy-to-mock.test.ts
import { describe, it, expect } from "vitest";
import { matchOperation, recordingToMock } from "./proxy-to-mock";
import type { ParsedSpec, ParsedOperation } from "./types";
import type { ProxyRecord } from "./proxy-client";

const ops: ParsedOperation[] = [
  { id: "GET /pet/findByStatus", method: "GET", path: "/pet/findByStatus", tags: [], parameters: [], responses: [] },
  { id: "GET /pet/{petId}", method: "GET", path: "/pet/{petId}", tags: [], parameters: [], responses: [] },
  { id: "POST /pet", method: "POST", path: "/pet", tags: [], parameters: [], responses: [] },
];
const spec = { info: { title: "t", version: "1" }, operations: ops, securitySchemes: [] } as unknown as ParsedSpec;

function rec(over: Partial<ProxyRecord>): ProxyRecord {
  return { atMs: 1, method: "GET", path: "/pet/findByStatus", status: 200, responseBody: "[]", ...over };
}

describe("matchOperation", () => {
  it("정확 경로 매칭", () => {
    expect(matchOperation(spec, "GET", "/pet/findByStatus")?.id).toBe("GET /pet/findByStatus");
  });
  it("path param 매칭", () => {
    expect(matchOperation(spec, "GET", "/pet/42")?.id).toBe("GET /pet/{petId}");
  });
  it("method 다르면 매칭 안 됨", () => {
    expect(matchOperation(spec, "DELETE", "/pet/42")).toBeNull();
  });
  it("없는 경로는 null", () => {
    expect(matchOperation(spec, "GET", "/unknown")).toBeNull();
  });
});

describe("recordingToMock", () => {
  it("배열 응답은 dataset으로, 매칭 opId 반환", () => {
    const r = recordingToMock(spec, rec({ responseBody: '[{"id":1}]' }));
    expect(r?.opId).toBe("GET /pet/findByStatus");
    expect(r?.dataset).toEqual([{ id: 1 }]);
    expect(r?.body).toBeUndefined();
  });
  it("객체 응답은 body로", () => {
    const r = recordingToMock(spec, rec({ method: "GET", path: "/pet/42", responseBody: '{"id":42}' }));
    expect(r?.opId).toBe("GET /pet/{petId}");
    expect(r?.body).toEqual({ id: 42 });
    expect(r?.dataset).toBeUndefined();
  });
  it("매칭 operation 없으면 null", () => {
    expect(recordingToMock(spec, rec({ path: "/nope" }))).toBeNull();
  });
  it("JSON 아닌 응답은 body 문자열로", () => {
    const r = recordingToMock(spec, rec({ responseBody: "plain text" }));
    expect(r?.body).toBe("plain text");
  });
});
