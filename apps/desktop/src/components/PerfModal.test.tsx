// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
  it("평균 헤더 클릭 시 ▼ 표시, 재클릭 시 ▲로 토글된다", () => {
    render(<PerfModal history={hist} onClose={vi.fn()} />);
    const avgHeader = screen.getByText(/평균/);
    // 초기: avgMs desc → ▼
    expect(avgHeader.textContent).toContain("▼");
    // 재클릭 → asc → ▲
    fireEvent.click(avgHeader);
    expect(avgHeader.textContent).toContain("▲");
    // 한 번 더 클릭 → desc → ▼
    fireEvent.click(avgHeader);
    expect(avgHeader.textContent).toContain("▼");
  });
  it("다른 컬럼 클릭 시 해당 컬럼이 활성화되고 방향은 desc로 초기화된다", () => {
    render(<PerfModal history={hist} onClose={vi.fn()} />);
    const p95Header = screen.getByText(/p95/);
    fireEvent.click(p95Header);
    expect(p95Header.textContent).toContain("▼");
    // 평균 헤더에는 방향 표시 없음
    expect(screen.getByText(/평균/).textContent).toBe("평균");
  });
});
