// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CurlImportModal } from "./CurlImportModal";

describe("CurlImportModal", () => {
  it("초기에는 가져오기 버튼이 비활성", () => {
    render(<CurlImportModal onImport={() => {}} onClose={() => {}} />);
    expect((screen.getByText("가져오기") as HTMLButtonElement).disabled).toBe(true);
  });

  it("유효한 cURL을 파싱해 onImport + onClose 호출", () => {
    const onImport = vi.fn();
    const onClose = vi.fn();
    render(<CurlImportModal onImport={onImport} onClose={onClose} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "curl -X POST https://api.example.com/users -d '{\"name\":\"kim\"}'" },
    });
    fireEvent.click(screen.getByText("가져오기"));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    const [, , baseURL] = onImport.mock.calls[0];
    expect(baseURL).toContain("api.example.com");
  });

  it("파싱 실패 시 에러 박스를 표시하고 닫지 않는다", () => {
    const onImport = vi.fn();
    const onClose = vi.fn();
    render(<CurlImportModal onImport={onImport} onClose={onClose} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "not a curl command" } });
    fireEvent.click(screen.getByText("가져오기"));
    expect(onImport).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector(".error-box")).toBeTruthy();
  });

  it("닫기 버튼이 onClose 호출", () => {
    const onClose = vi.fn();
    render(<CurlImportModal onImport={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByText("닫기"));
    expect(onClose).toHaveBeenCalled();
  });
});
