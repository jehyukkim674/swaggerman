// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ShortcutInput } from "./ShortcutInput";

describe("ShortcutInput", () => {
  it("현재 단축키를 표시한다", () => {
    render(<ShortcutInput value="CmdOrCtrl+Shift+P" onChange={vi.fn()} />);
    // mac 기준 표시(테스트 환경은 navigator.platform 기본 — 표시 문자열에 P 포함 확인)
    expect(screen.getByRole("button", { name: /단축키/ }).textContent).toMatch(/P/);
  });

  it("포커스 후 키 조합을 누르면 onChange가 accelerator로 호출된다", () => {
    const onChange = vi.fn();
    render(<ShortcutInput value="" onChange={onChange} />);
    const btn = screen.getByRole("button", { name: /단축키/ });
    fireEvent.keyDown(btn, { metaKey: true, shiftKey: true, key: "k" });
    expect(onChange).toHaveBeenCalledWith("CmdOrCtrl+Shift+K");
  });

  it("modifier 없는 단일 키는 무시한다", () => {
    const onChange = vi.fn();
    render(<ShortcutInput value="" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /단축키/ }), { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("지우기 버튼은 onChange('')를 호출한다", () => {
    const onChange = vi.fn();
    render(<ShortcutInput value="CmdOrCtrl+Shift+P" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "지우기" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
