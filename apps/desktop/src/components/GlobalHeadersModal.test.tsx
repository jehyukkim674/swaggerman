// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GlobalHeadersModal } from "./GlobalHeadersModal";
import type { RequestParam } from "../core/request-builder";

const HEADERS: RequestParam[] = [
  { key: "X-Trace", value: "1", enabled: true },
  { key: "X-Env", value: "dev", enabled: false },
];

describe("GlobalHeadersModal", () => {
  it("기존 헤더를 입력 필드로 렌더한다", () => {
    render(<GlobalHeadersModal headers={HEADERS} onChange={() => {}} onClose={() => {}} />);
    expect((screen.getByDisplayValue("X-Trace") as HTMLInputElement).value).toBe("X-Trace");
    expect(screen.getByDisplayValue("dev")).toBeTruthy();
  });

  it("'+ 헤더 추가'가 빈 행을 추가한다", () => {
    const onChange = vi.fn();
    render(<GlobalHeadersModal headers={HEADERS} onChange={onChange} onClose={() => {}} />);
    fireEvent.click(screen.getByText("+ 헤더 추가"));
    expect(onChange).toHaveBeenCalledWith([...HEADERS, { key: "", value: "", enabled: true }]);
  });

  it("키 편집이 해당 행만 갱신한다", () => {
    const onChange = vi.fn();
    render(<GlobalHeadersModal headers={HEADERS} onChange={onChange} onClose={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("X-Trace"), { target: { value: "X-Tr" } });
    expect(onChange).toHaveBeenCalledWith([
      { key: "X-Tr", value: "1", enabled: true },
      HEADERS[1],
    ]);
  });

  it("체크박스 토글이 enabled를 갱신한다", () => {
    const onChange = vi.fn();
    const { container } = render(
      <GlobalHeadersModal headers={HEADERS} onChange={onChange} onClose={() => {}} />,
    );
    const checkbox = container.querySelectorAll('input[type="checkbox"]')[0] as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith([{ ...HEADERS[0], enabled: false }, HEADERS[1]]);
  });

  it("삭제 버튼이 해당 행을 제거한다", () => {
    const onChange = vi.fn();
    render(<GlobalHeadersModal headers={HEADERS} onChange={onChange} onClose={() => {}} />);
    fireEvent.click(screen.getAllByTitle("삭제")[0]);
    expect(onChange).toHaveBeenCalledWith([HEADERS[1]]);
  });

  it("ESC로 닫힌다", () => {
    const onClose = vi.fn();
    render(<GlobalHeadersModal headers={HEADERS} onChange={() => {}} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
