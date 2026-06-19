import { describe, it, expect } from "vitest";
import { getByPath, toTable, findTable, cellText } from "./json-table";

describe("getByPath", () => {
  const obj = { data: { items: [{ id: 1 }, { id: 2 }], n: 3 } };
  it("점 경로로 값 추출", () => expect(getByPath(obj, "data.n")).toBe(3));
  it("배열 인덱스 [n]", () => expect(getByPath(obj, "data.items[1].id")).toBe(2));
  it("빈 경로는 루트", () => expect(getByPath(obj, "")).toBe(obj));
  it("없는 경로는 undefined", () => expect(getByPath(obj, "data.nope.x")).toBeUndefined());
});

describe("toTable", () => {
  it("객체 배열 → 컬럼 합집합·행", () => {
    const t = toTable([{ a: 1, b: 2 }, { a: 3, c: 4 }])!;
    expect(t.columns).toEqual(["a", "b", "c"]);
    expect(t.rows).toHaveLength(2);
    expect(t.truncated).toBe(false);
  });
  it("빈 배열·비객체 배열·비배열은 null", () => {
    expect(toTable([])).toBeNull();
    expect(toTable([1, 2, 3])).toBeNull();
    expect(toTable({ a: 1 })).toBeNull();
  });
});

describe("findTable", () => {
  it("루트가 객체 배열", () => {
    expect(findTable('[{"id":1}]')!.columns).toEqual(["id"]);
  });
  it("흔한 키(content) 자동 탐색", () => {
    const t = findTable('{"content":[{"x":1}],"total":1}')!;
    expect(t.columns).toEqual(["x"]);
  });
  it("임의 객체배열 프로퍼티 폴백", () => {
    const t = findTable('{"weird":[{"y":2}]}')!;
    expect(t.columns).toEqual(["y"]);
  });
  it("명시 경로 사용", () => {
    const t = findTable('{"a":{"b":[{"z":9}]}}', "a.b")!;
    expect(t.columns).toEqual(["z"]);
  });
  it("객체 배열이 없으면 null", () => {
    expect(findTable('{"x":1}')).toBeNull();
    expect(findTable("not json")).toBeNull();
  });
});

describe("cellText", () => {
  it("원시값", () => {
    expect(cellText(5)).toBe("5");
    expect(cellText(null)).toBe("null");
    expect(cellText(undefined)).toBe("");
  });
  it("객체/배열은 JSON", () => expect(cellText({ a: 1 })).toBe('{"a":1}'));
  it("긴 값은 자른다", () => {
    expect(cellText({ s: "x".repeat(300) }).endsWith("…")).toBe(true);
  });
});
