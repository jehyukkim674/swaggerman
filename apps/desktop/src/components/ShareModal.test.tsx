// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareModal } from "./ShareModal";
import type { ShareableRequest } from "../core/share";

const writeText = vi.fn();
beforeAll(() => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

// 내보내기·가져오기 테스트에서 공통으로 사용하는 현재 요청 픽스처
const current: ShareableRequest = {
  v: 1,
  method: "GET",
  url: "https://api.example.com/pets",
  pathParams: {},
  queryParams: [],
  headers: [
    { key: "Accept", value: "application/json", enabled: true },
    { key: "Authorization", value: "Bearer X", enabled: true },
  ],
  body: "",
};

describe("ShareModal 내보내기", () => {
  it("현재 요청으로 공유 코드를 생성해 표시한다", async () => {
    render(<ShareModal current={current} onApply={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      const code = screen.getByLabelText("공유 코드") as HTMLTextAreaElement;
      expect(code.value.startsWith("swaggerman:req:")).toBe(true);
    });
  });

  it("민감 헤더 제외 안내를 표시한다", async () => {
    render(<ShareModal current={current} onApply={vi.fn()} onClose={vi.fn()} />);
    // Authorization은 민감 헤더이므로 제외됨 안내가 표시돼야 함
    expect(await screen.findByText(/민감.*제외|Authorization/)).toBeTruthy();
  });

  it("복사 버튼이 클립보드에 코드를 쓴다", async () => {
    writeText.mockClear();
    render(<ShareModal current={current} onApply={vi.fn()} onClose={vi.fn()} />);
    // encodeShare(async)가 완료돼 textarea에 코드가 채워질 때까지 대기
    await waitFor(() => {
      const code = screen.getByLabelText("공유 코드") as HTMLTextAreaElement;
      expect(code.value.startsWith("swaggerman:req:")).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: /복사/ }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("swaggerman:req:"));
  });

  it("'민감정보 포함' 체크 시 코드가 다시 생성된다(민감 헤더 포함)", async () => {
    render(<ShareModal current={current} onApply={vi.fn()} onClose={vi.fn()} />);
    const before = (await screen.findByLabelText("공유 코드") as HTMLTextAreaElement).value;
    // aria-label이 있는 체크박스를 클릭
    fireEvent.click(screen.getByLabelText(/민감정보 포함/));
    await waitFor(() => {
      const after = (screen.getByLabelText("공유 코드") as HTMLTextAreaElement).value;
      expect(after).not.toBe(before); // 페이로드가 달라져 코드도 달라짐
    });
  });
});
