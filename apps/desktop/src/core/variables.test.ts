import { describe, it, expect, vi } from "vitest";
import {
  substituteVars,
  extractVarNames,
  unresolvedVars,
  extractByPath,
  applyExtractRules,
  runAssertions,
  dynamicValue,
  type Assertion,
} from "./variables";

describe("substituteVars", () => {
  it("정의된 변수를 치환한다", () => {
    expect(substituteVars("{{baseUrl}}/users", { baseUrl: "https://api.x" })).toBe(
      "https://api.x/users",
    );
  });

  it("공백/여러 변수도 처리한다", () => {
    const out = substituteVars("{{ a }}-{{b}}", { a: "1", b: "2" });
    expect(out).toBe("1-2");
  });

  it("미정의 변수는 원문을 유지한다", () => {
    expect(substituteVars("{{token}}", {})).toBe("{{token}}");
  });

  it("빈 문자열/널값을 안전하게 처리한다", () => {
    expect(substituteVars("", { a: "1" })).toBe("");
  });

  it("값이 빈 문자열인 변수도 치환한다", () => {
    expect(substituteVars("x={{q}}", { q: "" })).toBe("x=");
  });
});

describe("dynamicValue / 동적 변수 치환", () => {
  it("$timestamp는 숫자 문자열", () => {
    expect(dynamicValue("$timestamp")).toMatch(/^\d+$/);
  });

  it("$guid/$randomUUID는 UUID 형식", () => {
    expect(dynamicValue("$guid")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("$isoTimestamp는 ISO 형식", () => {
    expect(dynamicValue("$isoTimestamp")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("미지원 동적 변수는 null", () => {
    expect(dynamicValue("$nope")).toBeNull();
  });

  it("substituteVars가 동적 변수를 채운다(사용자 변수 우선)", () => {
    expect(substituteVars("id={{$randomInt}}", {})).toMatch(/^id=\d+$/);
    // 사용자 정의가 동적보다 우선
    expect(substituteVars("{{$timestamp}}", { $timestamp: "fixed" })).toBe("fixed");
    // 미지원 동적은 원문 유지
    expect(substituteVars("{{$unknown}}", {})).toBe("{{$unknown}}");
  });
});

describe("extractVarNames / unresolvedVars", () => {
  it("등장 변수 이름을 중복 없이 순서대로 반환한다", () => {
    expect(extractVarNames("{{a}}/{{b}}/{{a}}")).toEqual(["a", "b"]);
  });

  it("미해결(맵에 없거나 빈값) 변수만 반환한다", () => {
    expect(unresolvedVars("{{a}}/{{b}}/{{c}}", { a: "x", b: "" })).toEqual(["b", "c"]);
  });
});

describe("extractByPath", () => {
  const data = { token: "abc", data: { id: 7 }, items: [{ id: 1 }, { id: 2 }] };

  it("점 표기로 중첩 값을 읽는다", () => {
    expect(extractByPath(data, "data.id")).toBe(7);
  });

  it("배열 인덱스(점/대괄호)를 모두 지원한다", () => {
    expect(extractByPath(data, "items.1.id")).toBe(2);
    expect(extractByPath(data, "items[0].id")).toBe(1);
  });

  it("선행 $. 를 허용한다", () => {
    expect(extractByPath(data, "$.token")).toBe("abc");
  });

  it("없는 경로는 undefined", () => {
    expect(extractByPath(data, "data.missing")).toBeUndefined();
    expect(extractByPath(data, "items.9.id")).toBeUndefined();
  });
});

describe("applyExtractRules", () => {
  it("응답에서 값을 추출해 변수 맵을 만든다", () => {
    const body = JSON.stringify({ access_token: "T", user: { id: 5 } });
    const vars = applyExtractRules(body, [
      { varName: "token", path: "access_token" },
      { varName: "uid", path: "user.id" },
    ]);
    expect(vars).toEqual({ token: "T", uid: "5" });
  });

  it("JSON이 아니면 빈 맵", () => {
    expect(applyExtractRules("not json", [{ varName: "x", path: "a" }])).toEqual({});
  });

  it("path가 없는 값은 건너뛴다", () => {
    const body = JSON.stringify({ a: 1 });
    expect(applyExtractRules(body, [{ varName: "x", path: "b" }])).toEqual({});
  });
});

describe("runAssertions", () => {
  const body = JSON.stringify({ status: "ok", count: 3, name: "kim" });

  it("status 동등 비교", () => {
    const a: Assertion[] = [{ kind: "status", op: "equals", expected: "200" }];
    expect(runAssertions(200, body, a)[0].ok).toBe(true);
    expect(runAssertions(404, body, a)[0].ok).toBe(false);
  });

  it("jsonpath equals / contains / exists", () => {
    const asserts: Assertion[] = [
      { kind: "jsonpath", path: "status", op: "equals", expected: "ok" },
      { kind: "jsonpath", path: "name", op: "contains", expected: "ki" },
      { kind: "jsonpath", path: "count", op: "exists" },
      { kind: "jsonpath", path: "missing", op: "exists" },
    ];
    const r = runAssertions(200, body, asserts);
    expect(r.map((x) => x.ok)).toEqual([true, true, true, false]);
  });

  it("JSON이 아니면 jsonpath 어서션은 실패", () => {
    const a: Assertion[] = [{ kind: "jsonpath", path: "x", op: "exists" }];
    expect(runAssertions(200, "plain", a)[0].ok).toBe(false);
  });

  it("어서션이 없으면 본문을 파싱하지 않는다(대용량 응답 성능)", () => {
    const spy = vi.spyOn(JSON, "parse");
    const results = runAssertions(200, body, []);
    expect(results).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
