// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AiSuggestionCard } from "./AiSuggestionCard";
import type { RequestSuggestion } from "../core/ai/types";

const s: RequestSuggestion = { body: '{"name":"a"}', notes: "재고 포함", queryParams: { page: "2" } };

describe("AiSuggestionCard", () => {
  it("제안 본문과 메모를 표시한다", () => {
    render(<AiSuggestionCard suggestion={s} onApply={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText(/재고 포함/)).toBeTruthy();
    expect(screen.getByText(/"name"/)).toBeTruthy();
  });

  it("[폼에 적용] 클릭 시 onApply(suggestion) 호출", () => {
    const onApply = vi.fn();
    render(<AiSuggestionCard suggestion={s} onApply={onApply} onDismiss={() => {}} />);
    fireEvent.click(screen.getByText("폼에 적용"));
    expect(onApply).toHaveBeenCalledWith(s);
  });

  it("[무시] 클릭 시 onDismiss 호출", () => {
    const onDismiss = vi.fn();
    render(<AiSuggestionCard suggestion={s} onApply={() => {}} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("무시"));
    expect(onDismiss).toHaveBeenCalled();
  });
});
