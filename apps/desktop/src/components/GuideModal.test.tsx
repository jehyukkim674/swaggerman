// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GuideModal } from "./GuideModal";
import type { ParsedSpec, ParsedOperation } from "../core/types";

const op: ParsedOperation = {
  id: "GET /pet", method: "GET", path: "/pet", summary: "펫 목록", tags: [], parameters: [], responses: [],
};
const spec = { info: { title: "T", version: "1" }, operations: [op], securitySchemes: [] } as unknown as ParsedSpec;

const writeText = vi.fn().mockResolvedValue(undefined);
beforeAll(() => Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true }));

describe("GuideModal", () => {
  it("operation 목록과 생성 버튼을 표시한다", () => {
    render(<GuideModal spec={spec} history={[]} baseURL="https://x" onSaveFile={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("/pet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "생성" })).toBeTruthy();
  });
  it("생성하면 미리보기에 Markdown이 나온다", () => {
    render(<GuideModal spec={spec} history={[]} baseURL="https://x" onSaveFile={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "생성" }));
    const ta = screen.getByLabelText("가이드 미리보기") as HTMLTextAreaElement;
    expect(ta.value).toContain("# T 연동 가이드");
  });
  it("복사 버튼이 클립보드를 호출한다", () => {
    writeText.mockClear();
    render(<GuideModal spec={spec} history={[]} baseURL="https://x" onSaveFile={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "생성" }));
    fireEvent.click(screen.getByRole("button", { name: /복사/ }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("연동 가이드"));
  });
});

describe("GuideModal 추가 동작", () => {
  it("체크 해제로 모두 끄면 생성 버튼이 비활성", () => {
    render(<GuideModal spec={spec} history={[]} baseURL="https://x" onSaveFile={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox")); // 유일 op 해제
    expect((screen.getByRole("button", { name: "생성" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("'파일로 저장'이 onSaveFile에 Markdown을 전달", () => {
    const onSaveFile = vi.fn();
    render(<GuideModal spec={spec} history={[]} baseURL="https://x" onSaveFile={onSaveFile} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "생성" }));
    fireEvent.click(screen.getByRole("button", { name: "파일로 저장" }));
    expect(onSaveFile).toHaveBeenCalledWith(expect.stringContaining("연동 가이드"));
  });

  it("오버레이 클릭 시 onClose", () => {
    const onClose = vi.fn();
    const { container } = render(
      <GuideModal spec={spec} history={[]} baseURL="https://x" onSaveFile={vi.fn()} onClose={onClose} />,
    );
    fireEvent.mouseDown(container.querySelector(".modal-overlay")!);
    expect(onClose).toHaveBeenCalled();
  });
});
