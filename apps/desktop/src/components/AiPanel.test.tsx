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

  it("'/요청' 진행 중 새 대화를 누르면 늦게 온 제안을 버린다", async () => {
    let resolveComplete: (v: string) => void = () => {};
    const provider = makeProvider({
      complete: vi.fn().mockImplementation(() => new Promise<string>((res) => { resolveComplete = res; })),
    });
    render(<AiPanel provider={provider} buildContext={ctx} onApplySuggestion={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/질문/), { target: { value: "/요청 상품" } });
    fireEvent.click(screen.getByText("전송"));
    // 진행 중에 새 대화
    fireEvent.click(screen.getByText("새 대화"));
    // 이제 complete가 늦게 resolve
    resolveComplete(JSON.stringify({ body: "{}" }));
    // 제안 카드가 나타나지 않아야 한다
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("폼에 적용")).toBeNull();
  });

  it("done 이벤트의 토큰 사용량을 답변 아래 표시한다", async () => {
    const provider = makeProvider({
      chat: vi.fn((_req, onEvent): AiHandle => {
        onEvent({ kind: "delta", text: "답" });
        onEvent({ kind: "done", sessionId: "s1", inputTokens: 12, outputTokens: 34 });
        return { cancel: vi.fn() };
      }),
    });
    render(<AiPanel provider={provider} buildContext={ctx} onApplySuggestion={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/질문/), { target: { value: "안녕" } });
    fireEvent.click(screen.getByText("전송"));
    await waitFor(() => expect(screen.getAllByText(/12/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/34/).length).toBeGreaterThan(0);
  });

  it("claude 미발견 시 경고를 표시한다", async () => {
    const provider = makeProvider({ detect: vi.fn().mockResolvedValue({}) });
    render(<AiPanel provider={provider} buildContext={ctx} onApplySuggestion={() => {}} />);
    await waitFor(() => expect(screen.getByText(/claude CLI를 찾을 수 없습니다/)).toBeTruthy());
  });

  it("일반 답변의 '폼 채우기' 버튼이 complete를 호출하고 제안 카드를 띄운다", async () => {
    const provider = makeProvider();
    render(<AiPanel provider={provider} buildContext={ctx} onApplySuggestion={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/질문/), { target: { value: "이 요청 알려줘" } });
    fireEvent.click(screen.getByText("전송"));
    await waitFor(() => expect(screen.getByText(/답변/)).toBeTruthy());
    fireEvent.click(screen.getByText("✦ 폼 채우기"));
    await waitFor(() => expect(screen.getByText("폼에 적용")).toBeTruthy());
    expect(provider.complete).toHaveBeenCalled();
  });

  it("'새 대화'는 진행 중 스트림을 취소하고 busy를 해제한다", async () => {
    const cancel = vi.fn();
    const provider = makeProvider({
      chat: vi.fn((_req, onEvent): AiHandle => {
        onEvent({ kind: "delta", text: "부분" }); // done 없음 → busy 유지
        return { cancel };
      }),
    });
    render(<AiPanel provider={provider} buildContext={ctx} onApplySuggestion={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/질문/), { target: { value: "느린 질문" } });
    fireEvent.click(screen.getByText("전송"));
    // busy 상태: 전송 버튼이 "…"
    await waitFor(() => expect(screen.getByText("…")).toBeTruthy());
    // 새 대화 클릭 → 취소 호출 + busy 해제(전송 버튼 복귀)
    fireEvent.click(screen.getByText("새 대화"));
    expect(cancel).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("전송")).toBeTruthy());
  });

  it("응답 대기 중에는 생각 중 인디케이터를 표시한다", async () => {
    const provider = makeProvider({
      chat: vi.fn((_req, _onEvent): AiHandle => {
        // 아무 이벤트도 emit하지 않음 → busy 유지, 빈 assistant 버블
        return { cancel: vi.fn() };
      }),
    });
    render(<AiPanel provider={provider} buildContext={ctx} onApplySuggestion={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/질문/), { target: { value: "안녕" } });
    fireEvent.click(screen.getByText("전송"));
    await waitFor(() => expect(screen.getByLabelText("응답 생성 중")).toBeTruthy());
  });
});
