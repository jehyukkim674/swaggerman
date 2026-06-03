// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PerfModal } from "./PerfModal";
import type { HistoryItem } from "../core/history";

function h(opId: string, d: number, t: number): HistoryItem {
  return { id: `${opId}-${t}`, opId, method: opId.split(" ")[0], path: opId.split(" ")[1], url: "x",
    status: 200, durationMs: d, size: 0, executedAt: t, inputs: {} as HistoryItem["inputs"], responseHeaders: {}, responseBody: "" };
}
const hist = [h("GET /a", 10, 1), h("GET /a", 10, 2), h("GET /a", 100, 3), h("GET /a", 100, 4), h("GET /b", 30, 1)];

describe("PerfModal", () => {
  it("op별 행과 통계를 표시한다", () => {
    render(<PerfModal history={hist} onClose={vi.fn()} />);
    expect(screen.getByText("/a")).toBeTruthy();
    expect(screen.getByText("/b")).toBeTruthy();
  });
  it("느려지는 op에 경고 뱃지를 표시한다", () => {
    render(<PerfModal history={hist} onClose={vi.fn()} />);
    expect(screen.getByText(/느려지는 중/)).toBeTruthy(); // GET /a: 10,10→100,100
  });
  it("스파크라인을 렌더한다", () => {
    const { container } = render(<PerfModal history={hist} onClose={vi.fn()} />);
    expect(container.querySelectorAll(".sparkline").length).toBeGreaterThan(0);
  });
});
