import { describe, it, expect } from "vitest";
import { diffRecords, diffLines, diffLinesMarked } from "./diff";

describe("diffRecords", () => {
  it("추가/삭제/변경/동일을 구분한다", () => {
    const a = { keep: "1", change: "old", removed: "x" };
    const b = { keep: "1", change: "new", added: "y" };
    const out = diffRecords(a, b);
    const by = Object.fromEntries(out.map((d) => [d.key, d]));
    expect(by.keep.status).toBe("same");
    expect(by.change.status).toBe("changed");
    expect(by.change.a).toBe("old");
    expect(by.change.b).toBe("new");
    expect(by.removed.status).toBe("removed");
    expect(by.added.status).toBe("added");
  });

  it("빈 입력을 방어한다", () => {
    expect(diffRecords({}, {})).toEqual([]);
    expect(diffRecords({ a: "1" }, {})).toEqual([{ key: "a", a: "1", b: undefined, status: "removed" }]);
  });

  it("키는 정렬되어 나온다(안정적 표시)", () => {
    const out = diffRecords({ b: "1", a: "1" }, { b: "1", a: "1" });
    expect(out.map((d) => d.key)).toEqual(["a", "b"]);
  });
});

describe("diffLines", () => {
  it("동일한 텍스트는 모두 equal", () => {
    const out = diffLines("a\nb", "a\nb");
    expect(out).toEqual([
      { type: "equal", text: "a" },
      { type: "equal", text: "b" },
    ]);
  });

  it("추가된 줄은 add, 삭제된 줄은 remove", () => {
    const out = diffLines("a\nb\nc", "a\nc\nd");
    expect(out).toEqual([
      { type: "equal", text: "a" },
      { type: "remove", text: "b" },
      { type: "equal", text: "c" },
      { type: "add", text: "d" },
    ]);
  });

  it("완전히 다른 텍스트", () => {
    const out = diffLines("x", "y");
    expect(out).toEqual([
      { type: "remove", text: "x" },
      { type: "add", text: "y" },
    ]);
  });

  it("빈 입력 방어", () => {
    expect(diffLines("", "")).toEqual([{ type: "equal", text: "" }]);
    expect(diffLines("a", "")).toEqual([
      { type: "remove", text: "a" },
      { type: "add", text: "" },
    ]);
  });

  it("JSON 응답 비교 시나리오(값 변경)", () => {
    const a = '{\n  "count": 1,\n  "ok": true\n}';
    const b = '{\n  "count": 2,\n  "ok": true\n}';
    const out = diffLines(a, b);
    expect(out.filter((o) => o.type === "remove").map((o) => o.text)).toEqual(['  "count": 1,']);
    expect(out.filter((o) => o.type === "add").map((o) => o.text)).toEqual(['  "count": 2,']);
    expect(out.filter((o) => o.type === "equal").length).toBe(3);
  });
});

describe("diffLines — 대형 입력 보호", () => {
  it("수천 줄 입력에서도 동작한다(공통 접두/접미 최적화)", () => {
    const common = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");
    const a = common + "\nA-only";
    const b = common + "\nB-only";
    const out = diffLines(a, b);
    expect(out.filter((o) => o.type === "remove")).toEqual([{ type: "remove", text: "A-only" }]);
    expect(out.filter((o) => o.type === "add")).toEqual([{ type: "add", text: "B-only" }]);
    expect(out.filter((o) => o.type === "equal").length).toBe(5000);
  });

  it("가운데가 통째로 다른 초대형 입력은 폴백으로 처리한다", () => {
    const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join("\n");
    const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join("\n");
    const out = diffLines(a, b); // 3000*3000 > 4M → 폴백
    expect(out.filter((o) => o.type === "remove").length).toBe(3000);
    expect(out.filter((o) => o.type === "add").length).toBe(3000);
  });
});

describe("diffLinesMarked", () => {
  it("remove와 add가 섞인 hunk는 changed-a/changed-b로 재분류된다", () => {
    const out = diffLinesMarked("x:1\ny:2", "x:9\ny:2");
    expect(out).toEqual([
      { type: "changed-a", text: "x:1" },
      { type: "changed-b", text: "x:9" },
      { type: "equal", text: "y:2" },
    ]);
  });

  it("추가만 있는 hunk는 added", () => {
    const out = diffLinesMarked("a", "a\nb");
    expect(out).toEqual([
      { type: "equal", text: "a" },
      { type: "added", text: "b" },
    ]);
  });

  it("삭제만 있는 hunk는 removed", () => {
    const out = diffLinesMarked("a\nb", "a");
    expect(out).toEqual([
      { type: "equal", text: "a" },
      { type: "removed", text: "b" },
    ]);
  });

  it("equal 줄은 그대로 equal", () => {
    const out = diffLinesMarked("a\nb", "a\nb");
    expect(out).toEqual([
      { type: "equal", text: "a" },
      { type: "equal", text: "b" },
    ]);
  });

  it("여러 hunk가 각각 독립적으로 분류된다(changed hunk + added hunk 혼합)", () => {
    // A: head / old / tail
    // B: head / new / tail / extra
    //  → old/new 묶음은 changed, 끝의 extra 묶음은 added
    const out = diffLinesMarked("head\nold\ntail", "head\nnew\ntail\nextra");
    expect(out).toEqual([
      { type: "equal", text: "head" },
      { type: "changed-a", text: "old" },
      { type: "changed-b", text: "new" },
      { type: "equal", text: "tail" },
      { type: "added", text: "extra" },
    ]);
  });
});
