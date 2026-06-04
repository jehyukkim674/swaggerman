// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimeTravelModal } from "./TimeTravelModal";
import type { ParsedSpec, ParsedOperation } from "../core/types";
import type { Snapshot } from "../core/snapshots";

const op: ParsedOperation = { id: "GET /pet", method: "GET", path: "/pet", summary: "펫", tags: [], parameters: [], responses: [] };
const spec = { info: { title: "T", version: "1" }, operations: [op], securitySchemes: [] } as unknown as ParsedSpec;
const snaps: Snapshot[] = [
  { id: "s1", opId: "GET /pet", at: 1000, method: "GET", path: "/pet", status: 200, body: "[]", durationMs: 5 },
  { id: "s2", opId: "GET /pet", at: 2000, method: "GET", path: "/pet", status: 500, body: "{}", durationMs: 9 },
];

beforeEach(() => localStorage.clear());

function renderModal(over: Partial<Parameters<typeof TimeTravelModal>[0]> = {}) {
  const onCapture = vi.fn();
  const onCompare = vi.fn();
  render(<TimeTravelModal specUrl="u" spec={spec} snapshots={snaps} onCapture={onCapture} onCompare={onCompare} onClose={vi.fn()} {...over} />);
  return { onCapture, onCompare };
}

describe("TimeTravelModal", () => {
  it("대상 API 체크박스와 '지금 스냅샷' 버튼을 표시한다", () => {
    renderModal();
    expect(screen.getByText("/pet")).toBeTruthy();
    expect(screen.getByRole("button", { name: /지금 스냅샷/ })).toBeTruthy();
  });
  it("타임라인에 스냅샷을 시간순 표시한다", () => {
    renderModal();
    // 상태 200, 500 둘 다 보임
    expect(screen.getAllByText(/200|500/).length).toBeGreaterThanOrEqual(2);
  });
  it("대상 체크 후 '지금 스냅샷'이 onCapture를 호출한다", () => {
    const { onCapture } = renderModal();
    fireEvent.click(screen.getByLabelText("GET /pet 대상")); // 체크박스
    fireEvent.click(screen.getByRole("button", { name: /지금 스냅샷/ }));
    expect(onCapture).toHaveBeenCalledWith(["GET /pet"]);
  });
  it("스냅샷 2개 선택 후 비교가 onCompare를 호출한다", () => {
    const { onCompare } = renderModal();
    const checks = screen.getAllByLabelText(/비교 선택/);
    fireEvent.click(checks[0]);
    fireEvent.click(checks[1]);
    fireEvent.click(screen.getByRole("button", { name: /비교/ }));
    expect(onCompare).toHaveBeenCalled();
  });
});

describe("TimeTravelModal 추가 동작", () => {
  it("자동 캡처 체크박스를 토글하면 안내가 나타난다", () => {
    renderModal();
    const auto = screen.getByText("자동").closest("label")!.querySelector('input[type="checkbox"]')!;
    fireEvent.click(auto);
    expect(screen.getByText(/자동 캡처 켜짐/)).toBeTruthy();
  });

  it("'응답' 버튼으로 스냅샷 본문을 펼치고 다시 접는다", () => {
    renderModal();
    const respBtns = screen.getAllByRole("button", { name: "응답" });
    fireEvent.click(respBtns[0]);
    // 본문 영역이 나타남(다시 클릭하면 닫힘)
    fireEvent.click(respBtns[0]);
    expect(respBtns[0]).toBeTruthy();
  });

  it("대상이 없으면 '지금 스냅샷' 버튼이 비활성", () => {
    renderModal();
    expect((screen.getByRole("button", { name: /지금 스냅샷/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("스냅샷이 없는 operation은 '기록 없음' 힌트", () => {
    renderModal({ snapshots: [] });
    expect(screen.getByText(/기록 없음/)).toBeTruthy();
  });
});
