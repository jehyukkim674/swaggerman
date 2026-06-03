// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareModal } from "./ShareModal";
import { encodeShare, type ShareableRequest } from "../core/share";

const writeText = vi.fn().mockResolvedValue(undefined);
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

describe("ShareModal 가져오기", () => {
  it("유효한 코드를 붙여넣으면 미리보기를 표시하고 적용 콜백을 호출한다", async () => {
    const onApply = vi.fn();
    // current를 encodeShare로 인코딩해 가져오기 입력값으로 사용
    const code = await encodeShare(current);
    render(<ShareModal current={null} onApply={onApply} onClose={vi.fn()} />);
    // current=null이라 가져오기 탭이 기본
    const input = screen.getByLabelText("공유 코드 입력") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: code } });
    // 미리보기에 메서드·URL 표시
    expect(await screen.findByText(/GET/)).toBeTruthy();
    expect(screen.getByText(/api\.example\.com\/pets/)).toBeTruthy();
    // 적용 버튼 클릭
    fireEvent.click(screen.getByRole("button", { name: /적용/ }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ method: "GET" }));
  });

  it("깨진 코드는 에러를 표시하고 적용 버튼이 비활성이다", async () => {
    render(<ShareModal current={null} onApply={vi.fn()} onClose={vi.fn()} />);
    const input = screen.getByLabelText("공유 코드 입력");
    fireEvent.change(input, { target: { value: "swaggerman:req:!!!깨짐" } });
    expect(await screen.findByText(/읽을 수 없습니다|형식/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /적용/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
