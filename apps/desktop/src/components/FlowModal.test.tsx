// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FlowModal } from "./FlowModal";
import type { ParsedSpec, ParsedOperation } from "../core/types";
import type { ExecResult } from "../core/flow";

const ops: ParsedOperation[] = [
  {
    id: "POST /login",
    method: "POST",
    path: "/login",
    tags: [],
    parameters: [],
    responses: [],
  },
  {
    id: "GET /me",
    method: "GET",
    path: "/me",
    tags: [],
    parameters: [],
    responses: [],
  },
];
const spec = {
  info: { title: "T", version: "1" },
  operations: ops,
  securitySchemes: [],
} as unknown as ParsedSpec;

beforeEach(() => localStorage.clear());

function renderModal(
  execOne?: (opId: string, vars: Record<string, string>) => Promise<ExecResult>,
) {
  const fn =
    execOne ?? vi.fn(async () => ({ status: 200, ok: true, body: "{}", durationMs: 1 }));
  render(
    <FlowModal
      specUrl="u"
      spec={spec}
      initialVars={{}}
      execOne={fn}
      onClose={vi.fn()}
    />,
  );
  return fn;
}

describe("FlowModal", () => {
  it("새 플로우를 만들고 단계를 추가한다", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /새 플로우/ }));
    // operation 선택 후 단계 추가 (UI에 '단계 추가' 버튼 + operation Select)
    fireEvent.click(screen.getByRole("button", { name: /단계 추가/ }));
    expect(screen.getAllByText(/\/login|\/me/).length).toBeGreaterThan(0);
  });

  it("전체 실행 시 execOne을 호출하고 결과를 표시한다", async () => {
    const execOne = vi.fn(async () => ({
      status: 200,
      ok: true,
      body: '{"token":"X"}',
      durationMs: 2,
    }));
    renderModal(execOne);
    fireEvent.click(screen.getByRole("button", { name: /새 플로우/ }));
    fireEvent.click(screen.getByRole("button", { name: /단계 추가/ }));
    fireEvent.click(screen.getByRole("button", { name: /전체 실행/ }));
    await waitFor(() => expect(execOne).toHaveBeenCalled());
    expect(await screen.findByText(/200/)).toBeTruthy();
  });
});
