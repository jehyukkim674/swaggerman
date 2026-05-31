import { describe, it, expect } from "vitest";
import { requestSuggestionSchema, parseSuggestion, applySuggestion } from "./schema";
import type { RequestInputs } from "../request-builder";

function emptyInputs(): RequestInputs {
  return {
    pathParams: { id: "" },
    queryParams: [{ key: "dryRun", value: "", enabled: false }],
    headers: [],
    body: "",
    bodyMode: "raw",
    form: [],
  };
}

describe("requestSuggestionSchema", () => {
  it("object 타입이고 알려진 속성을 가진다", () => {
    expect(requestSuggestionSchema.type).toBe("object");
    expect(requestSuggestionSchema.properties).toHaveProperty("body");
    expect(requestSuggestionSchema.properties).toHaveProperty("queryParams");
  });
});

describe("parseSuggestion", () => {
  it("순수 제안 JSON을 파싱한다", () => {
    const raw = JSON.stringify({ body: '{"name":"a"}', notes: "ok" });
    expect(parseSuggestion(raw)).toEqual({ body: '{"name":"a"}', notes: "ok" });
  });

  it("claude json 래퍼({result})를 벗겨낸다", () => {
    const inner = { body: '{"x":1}' };
    const raw = JSON.stringify({ type: "result", result: JSON.stringify(inner) });
    expect(parseSuggestion(raw)).toEqual(inner);
  });

  it("result가 객체인 래퍼도 처리한다", () => {
    const inner = { headers: { "X-A": "1" } };
    const raw = JSON.stringify({ result: inner });
    expect(parseSuggestion(raw)).toEqual(inner);
  });

  it("파싱 불가하면 null", () => {
    expect(parseSuggestion("not json")).toBeNull();
  });

  it("알 수 없는 필드는 버린다", () => {
    const raw = JSON.stringify({ body: "{}", hacker: "rm -rf", method: "DELETE" });
    expect(parseSuggestion(raw)).toEqual({ body: "{}" });
  });
});

describe("applySuggestion", () => {
  it("pathParams를 병합한다", () => {
    const out = applySuggestion(emptyInputs(), { pathParams: { id: "42" } });
    expect(out.pathParams.id).toBe("42");
  });

  it("기존 query 키는 값 갱신+활성화, 새 키는 추가한다", () => {
    const out = applySuggestion(emptyInputs(), { queryParams: { dryRun: "true", page: "2" } });
    const dry = out.queryParams.find((q) => q.key === "dryRun")!;
    expect(dry.value).toBe("true");
    expect(dry.enabled).toBe(true);
    expect(out.queryParams.find((q) => q.key === "page")?.value).toBe("2");
  });

  it("headers를 upsert한다", () => {
    const out = applySuggestion(emptyInputs(), { headers: { "X-Trace": "abc" } });
    expect(out.headers.find((h) => h.key === "X-Trace")?.value).toBe("abc");
  });

  it("body를 교체한다", () => {
    const out = applySuggestion(emptyInputs(), { body: '{"name":"hi"}' });
    expect(out.body).toBe('{"name":"hi"}');
  });

  it("원본을 변형하지 않는다(불변)", () => {
    const input = emptyInputs();
    applySuggestion(input, { body: "changed" });
    expect(input.body).toBe("");
  });
});
