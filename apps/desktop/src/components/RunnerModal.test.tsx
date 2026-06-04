// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RunnerModal, type RunResult } from "./RunnerModal";
import type { Collection } from "../core/collections";

const COLLECTIONS: Collection[] = [
  {
    id: "c1",
    name: "스모크",
    requests: [
      { id: "r1", name: "헬스체크", method: "GET", url: "https://x/health", headers: [], body: "" },
      { id: "r2", name: "로그인", method: "POST", url: "https://x/login", headers: [], body: "" },
    ],
  },
];

describe("RunnerModal", () => {
  it("빈 컬렉션이면 안내 힌트", () => {
    render(<RunnerModal collections={[]} onRun={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/저장된 컬렉션이 없습니다/)).toBeTruthy();
  });

  it("선택된 컬렉션의 요청들을 나열한다", () => {
    render(<RunnerModal collections={COLLECTIONS} onRun={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("헬스체크")).toBeTruthy();
    expect(screen.getByText("로그인")).toBeTruthy();
  });

  it("실행 시 각 요청을 호출하고 통과 리포트를 보여준다", async () => {
    const onRun = vi
      .fn<() => Promise<RunResult>>()
      .mockResolvedValueOnce({ status: 200, ok: true, durationMs: 12 })
      .mockResolvedValueOnce({ status: 401, ok: false, durationMs: 8 });
    render(<RunnerModal collections={COLLECTIONS} onRun={onRun} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("실행"));
    await waitFor(() => expect(screen.getByText("1/2 통과")).toBeTruthy());
    expect(onRun).toHaveBeenCalledTimes(2);
    expect(screen.getByText("200")).toBeTruthy();
    expect(screen.getByText("401")).toBeTruthy();
  });

  it("오류가 난 요청은 '오류'로 표시", async () => {
    const onRun = vi
      .fn<() => Promise<RunResult>>()
      .mockResolvedValue({ status: 0, ok: false, durationMs: 0, error: "네트워크 실패" });
    render(
      <RunnerModal
        collections={[{ id: "c1", name: "단건", requests: [COLLECTIONS[0].requests[0]] }]}
        onRun={onRun}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("실행"));
    await waitFor(() => expect(screen.getByText("오류")).toBeTruthy());
  });

  it("닫기 버튼이 onClose 호출", () => {
    const onClose = vi.fn();
    render(<RunnerModal collections={COLLECTIONS} onRun={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByText("닫기"));
    expect(onClose).toHaveBeenCalled();
  });
});
