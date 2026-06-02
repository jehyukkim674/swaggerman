// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Select, type SelectOption } from "./Select";

const OPTIONS: SelectOption[] = [
  { value: "", label: "전체 태그 (3)", hint: "20개" },
  { value: "admin", label: "admin", hint: "3개" },
  { value: "auth", label: "auth", hint: "4개" },
  { value: "device", label: "device", hint: "5개" },
];

function renderSelect(over: Partial<Parameters<typeof Select>[0]> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <Select options={OPTIONS} value="" onChange={onChange} {...over} />,
  );
  return { onChange, ...utils };
}

describe("Select", () => {
  it("트리거에 선택된 옵션의 라벨을 표시한다", () => {
    renderSelect({ value: "admin" });
    expect(screen.getByRole("button").textContent).toBe("admin");
  });

  it("value에 해당하는 옵션이 없으면 placeholder를 표시한다", () => {
    renderSelect({ value: "없는값", placeholder: "프로젝트 선택…" });
    expect(screen.getByRole("button").textContent).toBe("프로젝트 선택…");
  });

  it("트리거 클릭 시 패널이 열리고 모든 옵션이 보인다", () => {
    renderSelect();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(OPTIONS.length);
  });

  it("옵션 클릭 시 onChange가 호출되고 패널이 닫힌다", () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole("button"));
    fireEvent.mouseDown(screen.getByText("auth"));
    expect(onChange).toHaveBeenCalledWith("auth");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("선택된 옵션에 체크(✓)와 selected 클래스를 표시한다", () => {
    renderSelect({ value: "admin" });
    fireEvent.click(screen.getByRole("button"));
    const selected = screen
      .getAllByRole("option")
      .find((el) => el.classList.contains("selected"));
    expect(selected?.textContent).toContain("admin");
    expect(selected?.textContent).toContain("✓");
  });

  it("옵션의 hint를 표시한다", () => {
    renderSelect();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("4개")).toBeTruthy();
  });

  it("searchable이면 검색창이 표시되고 입력 시 옵션이 필터된다", () => {
    renderSelect({ searchable: true, searchPlaceholder: "태그 검색…" });
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByPlaceholderText("태그 검색…");
    fireEvent.change(input, { target: { value: "ad" } });
    const labels = screen.getAllByRole("option").map((el) => el.textContent);
    expect(labels.some((t) => t?.includes("admin"))).toBe(true);
    expect(labels.some((t) => t?.includes("device"))).toBe(false);
  });

  it("검색 결과가 없으면 '결과 없음'을 표시한다", () => {
    renderSelect({ searchable: true });
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByPlaceholderText("검색…"), {
      target: { value: "zzz없는태그" },
    });
    expect(screen.getByText("결과 없음")).toBeTruthy();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("searchable이 아니면 검색창을 표시하지 않는다", () => {
    renderSelect();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByPlaceholderText("검색…")).toBeNull();
  });

  it("Escape 키로 패널이 닫힌다", () => {
    renderSelect();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("ArrowDown + Enter로 다음 옵션을 선택한다", () => {
    const { onChange } = renderSelect({ value: "admin" });
    fireEvent.click(screen.getByRole("button"));
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("auth");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("바깥 클릭 시 패널이 닫히고 onChange는 호출되지 않는다", () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole("button"));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disabled면 클릭해도 패널이 열리지 않는다", () => {
    renderSelect({ disabled: true });
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
