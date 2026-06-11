// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { MockRequestsPanel } from "./MockRequestsPanel";
import type { MockRequestEntry } from "../core/mock-config";

function entry(over: Partial<MockRequestEntry> = {}): MockRequestEntry {
  return { id: "e1", method: "GET", path: "/api/v1/code/IP_STATUS", status: 200, body: [{ id: 1 }], delayMs: 0, ...over };
}

describe("MockRequestsPanel", () => {
  it("요청 엔트리 목록을 표시한다(메서드·경로·상태)", () => {
    render(<MockRequestsPanel requests={[entry()]} onChange={vi.fn()} />);
    expect(screen.getByText("/api/v1/code/IP_STATUS")).toBeTruthy();
    expect(screen.getByText("200")).toBeTruthy();
    expect(screen.getByText(/요청 엔트리.*· 1/)).toBeTruthy();
  });

  it("엔트리가 없으면 안내 힌트를 보여준다", () => {
    render(<MockRequestsPanel requests={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/전체 Mock으로.*저장하거나/)).toBeTruthy();
  });

  it("'+ 요청 추가'로 빈 엔트리를 만든다", () => {
    const onChange = vi.fn();
    render(<MockRequestsPanel requests={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "+ 요청 추가" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as MockRequestEntry[];
    expect(next).toHaveLength(1);
    expect(next[0].method).toBe("GET");
  });

  it("행 클릭 시 편집 영역이 열리고 경로/상태를 수정할 수 있다", () => {
    const onChange = vi.fn();
    render(<MockRequestsPanel requests={[entry()]} onChange={onChange} />);
    fireEvent.click(screen.getByText("/api/v1/code/IP_STATUS"));
    const pathInput = screen.getByPlaceholderText("/api/v1/...") as HTMLInputElement;
    expect(pathInput.value).toBe("/api/v1/code/IP_STATUS");
    fireEvent.change(pathInput, { target: { value: "/api/v1/code/IP_USAGE" } });
    const updated = onChange.mock.calls[onChange.mock.calls.length - 1][0] as MockRequestEntry[];
    expect(updated[0].path).toBe("/api/v1/code/IP_USAGE");
  });

  it("쿼리 조건을 추가하고 응답 본문을 편집할 수 있다", () => {
    const onChange = vi.fn();
    render(<MockRequestsPanel requests={[entry()]} onChange={onChange} />);
    fireEvent.click(screen.getByText("/api/v1/code/IP_STATUS"));
    fireEvent.click(screen.getByRole("button", { name: "+ 쿼리 조건" }));
    expect((onChange.mock.calls[onChange.mock.calls.length - 1][0] as MockRequestEntry[])[0].query).toEqual([{ name: "", value: "" }]);
    // 응답 본문 편집
    const body = screen.getByRole("textbox", { name: "" }) as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: '{"v":9}' } });
    expect((onChange.mock.calls[onChange.mock.calls.length - 1][0] as MockRequestEntry[])[0].body).toEqual({ v: 9 });
  });

  it("삭제 버튼으로 엔트리를 제거한다", () => {
    const onChange = vi.fn();
    render(<MockRequestsPanel requests={[entry(), entry({ id: "e2", path: "/b" })]} onChange={onChange} />);
    fireEvent.click(screen.getAllByTitle("요청 엔트리 삭제")[0]);
    const next = onChange.mock.calls[onChange.mock.calls.length - 1][0] as MockRequestEntry[];
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("e2");
  });
});
