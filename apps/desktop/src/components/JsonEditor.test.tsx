// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { JsonEditor } from "./JsonEditor";

describe("JsonEditor", () => {
  it("값을 textarea에 표시하고 라인번호를 렌더한다", () => {
    const { container } = render(<JsonEditor value={'{\n  "a": 1\n}'} onChange={() => {}} />);
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta.value).toBe('{\n  "a": 1\n}');
    expect(container.querySelectorAll(".je-lnum").length).toBe(3);
  });

  it("입력 시 onChange를 호출한다", () => {
    const onChange = vi.fn();
    render(<JsonEditor value="{}" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "{ }" } });
    expect(onChange).toHaveBeenCalledWith("{ }");
  });

  it("Tab 키는 공백 2칸을 삽입한다", () => {
    const onChange = vi.fn();
    const { container } = render(<JsonEditor value="ab" onChange={onChange} />);
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    ta.selectionStart = 1;
    ta.selectionEnd = 1;
    fireEvent.keyDown(ta, { key: "Tab" });
    expect(onChange).toHaveBeenCalledWith("a  b");
  });

  it("스크롤 시 하이라이트/거터가 동기화된다(throw 없이)", () => {
    const { container } = render(<JsonEditor value={"a\nb"} onChange={() => {}} />);
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(() => fireEvent.scroll(ta)).not.toThrow();
  });

  it("rows prop으로 높이를 지정한다", () => {
    const { container } = render(<JsonEditor value="x" onChange={() => {}} rows={4} />);
    const root = container.querySelector(".json-editor") as HTMLElement;
    expect(root.style.height).toBe("6em");
  });
});
