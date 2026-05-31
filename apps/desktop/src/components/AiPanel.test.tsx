// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AiPanel } from "./AiPanel";
import type { AiProvider, AiHandle } from "../core/ai/provider";

function makeProvider(over: Partial<AiProvider> = {}): AiProvider {
  return {
    id: "claude",
    displayName: "Claude",
    detect: vi.fn().mockResolvedValue({ claude: { path: "/c", version: "v" } }),
    chat: vi.fn((_req, onEvent): AiHandle => {
      onEvent({ kind: "delta", text: "답변" });
      onEvent({ kind: "done", sessionId: "s1" });
      return { cancel: vi.fn() };
    }),
    complete: vi.fn().mockResolvedValue(JSON.stringify({ body: '{"ok":1}' })),
    ...over,
  };
}

const ctx = () => "## 현재 엔드포인트\nGET /x";

describe("AiPanel", () => {
  it("질문 전송 시 chat을 호출하고 응답 델타를 렌더한다", async () => {
    const provider = makeProvider();
    render(<AiPanel provider={provider} buildContext={ctx} onApplySuggestion={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/질문/), { target: { value: "이거 뭐야?" } });
    fireEvent.click(screen.getByText("전송"));
    await waitFor(() => expect(screen.getByText(/답변/)).toBeTruthy());
    expect(provider.chat).toHaveBeenCalled();
  });

  it("'/요청' 접두는 complete로 라우팅하고 제안 카드를 띄운다", async () => {
    const provider = makeProvider();
    render(<AiPanel provider={provider} buildContext={ctx} onApplySuggestion={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/질문/), { target: { value: "/요청 상품 생성" } });
    fireEvent.click(screen.getByText("전송"));
    await waitFor(() => expect(screen.getByText("폼에 적용")).toBeTruthy());
    expect(provider.complete).toHaveBeenCalled();
  });

  it("제안 카드의 적용은 onApplySuggestion으로 전달된다", async () => {
    const provider = makeProvider();
    const onApply = vi.fn();
    render(<AiPanel provider={provider} buildContext={ctx} onApplySuggestion={onApply} />);
    fireEvent.change(screen.getByPlaceholderText(/질문/), { target: { value: "/요청 x" } });
    fireEvent.click(screen.getByText("전송"));
    await waitFor(() => screen.getByText("폼에 적용"));
    fireEvent.click(screen.getByText("폼에 적용"));
    expect(onApply).toHaveBeenCalledWith({ body: '{"ok":1}' });
  });
});
