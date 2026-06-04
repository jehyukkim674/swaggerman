// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TestPanel } from "./TestPanel";
import type { Assertion, AssertionResult, ExtractRule } from "../core/variables";

function setup(over: Partial<Parameters<typeof TestPanel>[0]> = {}) {
  const props = {
    extractRules: [] as ExtractRule[],
    assertions: [] as Assertion[],
    results: [] as AssertionResult[],
    onExtractChange: vi.fn(),
    onAssertChange: vi.fn(),
    ...over,
  };
  render(<TestPanel {...props} />);
  return props;
}

describe("TestPanel", () => {
  it("'+ 추출 규칙'이 빈 규칙을 추가", () => {
    const { onExtractChange } = setup();
    fireEvent.click(screen.getByText("+ 추출 규칙"));
    expect(onExtractChange).toHaveBeenCalledWith([{ varName: "", path: "" }]);
  });

  it("추출 규칙 varName/path 편집", () => {
    const { onExtractChange } = setup({ extractRules: [{ varName: "token", path: "data.t" }] });
    fireEvent.change(screen.getByDisplayValue("token"), { target: { value: "tok" } });
    expect(onExtractChange).toHaveBeenCalledWith([{ varName: "tok", path: "data.t" }]);
    fireEvent.change(screen.getByDisplayValue("data.t"), { target: { value: "data.token" } });
    expect(onExtractChange).toHaveBeenCalledWith([{ varName: "token", path: "data.token" }]);
  });

  it("추출 규칙 삭제", () => {
    const { onExtractChange } = setup({ extractRules: [{ varName: "a", path: "b" }] });
    fireEvent.click(screen.getByTitle("삭제"));
    expect(onExtractChange).toHaveBeenCalledWith([]);
  });

  it("'+ 어서션'이 기본 status 어서션을 추가", () => {
    const { onAssertChange } = setup();
    fireEvent.click(screen.getByText("+ 어서션"));
    expect(onAssertChange).toHaveBeenCalledWith([{ kind: "status", op: "equals", expected: "200" }]);
  });

  it("status 어서션은 기대값 입력을, jsonpath는 path 입력을 노출", () => {
    setup({ assertions: [{ kind: "jsonpath", path: "data.id", op: "equals", expected: "1" }] });
    expect(screen.getByDisplayValue("data.id")).toBeTruthy();
    expect(screen.getByDisplayValue("1")).toBeTruthy();
  });

  it("exists 연산은 기대값 입력을 숨긴다", () => {
    setup({ assertions: [{ kind: "jsonpath", path: "data.id", op: "exists" }] });
    expect(screen.getByDisplayValue("data.id")).toBeTruthy();
    expect(screen.queryByPlaceholderText("기대값")).toBeNull();
  });

  it("기대값 편집이 onAssertChange 호출", () => {
    const { onAssertChange } = setup({
      assertions: [{ kind: "status", op: "equals", expected: "200" }],
    });
    fireEvent.change(screen.getByDisplayValue("200"), { target: { value: "201" } });
    expect(onAssertChange).toHaveBeenCalledWith([{ kind: "status", op: "equals", expected: "201" }]);
  });

  it("어서션 결과 배지(통과/실패)를 표시한다", () => {
    setup({
      assertions: [
        { kind: "status", op: "equals", expected: "200" },
        { kind: "status", op: "equals", expected: "201" },
      ],
      results: [
        { ok: true, label: "status", detail: "ok" },
        { ok: false, label: "status", detail: "fail" },
      ],
    });
    expect(screen.getByText("1/2")).toBeTruthy();
  });

  it("Select로 어서션 종류를 jsonpath로 바꾼다", () => {
    const { onAssertChange } = setup({
      assertions: [{ kind: "status", op: "equals", expected: "200" }],
    });
    // 첫 Select(assert-kind) 열기
    const kindSelect = document.querySelector(".assert-kind button") as HTMLButtonElement;
    fireEvent.click(kindSelect);
    const listbox = screen.getByRole("listbox");
    fireEvent.mouseDown(within(listbox).getByText("jsonpath"));
    expect(onAssertChange).toHaveBeenCalledWith([
      { kind: "jsonpath", op: "equals", expected: "200" },
    ]);
  });

  it("어서션 삭제", () => {
    const { onAssertChange } = setup({
      assertions: [{ kind: "status", op: "equals", expected: "200" }],
    });
    fireEvent.click(screen.getByTitle("삭제"));
    expect(onAssertChange).toHaveBeenCalledWith([]);
  });
});
