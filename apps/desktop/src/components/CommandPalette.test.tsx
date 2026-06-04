// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommandPalette } from "./CommandPalette";
import type { ParsedOperation } from "../core/types";
import type { Collection } from "../core/collections";

const OPS: ParsedOperation[] = [
  { id: "GET /users", method: "GET", path: "/users", summary: "유저 목록", tags: [], parameters: [], responses: [] },
  { id: "POST /orders", method: "POST", path: "/orders", summary: "주문 생성", tags: [], parameters: [], responses: [] },
];

const COLLECTIONS: Collection[] = [
  {
    id: "c1",
    name: "내 컬렉션",
    requests: [
      { id: "r1", name: "로그인 호출", method: "POST", url: "https://x/login", headers: [], body: "" },
    ],
  },
];

function setup(over: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const props = {
    operations: OPS,
    collections: COLLECTIONS,
    onSelectOperation: vi.fn(),
    onSelectSaved: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<CommandPalette {...props} />);
  return props;
}

describe("CommandPalette", () => {
  it("오퍼레이션과 저장 요청을 모두 나열한다", () => {
    setup();
    expect(screen.getByText("/users")).toBeTruthy();
    expect(screen.getByText("/orders")).toBeTruthy();
    expect(screen.getByText("로그인 호출")).toBeTruthy();
  });

  it("검색어로 필터링한다", () => {
    setup();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "orders" } });
    expect(screen.getByText("/orders")).toBeTruthy();
    expect(screen.queryByText("/users")).toBeNull();
  });

  it("결과가 없으면 '결과 없음'", () => {
    setup();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "zzzzz" } });
    expect(screen.getByText("결과 없음")).toBeTruthy();
  });

  it("항목 클릭 시 해당 핸들러 + onClose 호출", () => {
    const { onSelectSaved, onClose } = setup();
    fireEvent.mouseDown(screen.getByText("로그인 호출"));
    expect(onSelectSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("화살표+Enter 키보드 내비게이션으로 선택", () => {
    const { onSelectOperation } = setup();
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelectOperation).toHaveBeenCalledWith(OPS[1]);
  });

  it("ArrowUp은 첫 항목 위로 넘어가지 않는다", () => {
    const { onSelectOperation } = setup();
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelectOperation).toHaveBeenCalledWith(OPS[0]);
  });

  it("Escape 키가 onClose 호출", () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("응답이 있으면 AI 설명/진단 항목을 노출한다", () => {
    const onAskAiResponse = vi.fn();
    const { onClose } = setup({ hasResponse: true, responseIsError: true, onAskAiResponse });
    expect(screen.getByText("응답 설명")).toBeTruthy();
    fireEvent.mouseDown(screen.getByText("응답 진단"));
    expect(onAskAiResponse).toHaveBeenCalledWith("diagnose");
    expect(onClose).toHaveBeenCalled();
  });
});
