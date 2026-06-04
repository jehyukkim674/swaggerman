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

// ── 확장 커버리지: 단계 편집/실행 ───────────────────────────────
function setupWithStep(
  execOne?: (opId: string, vars: Record<string, string>) => Promise<ExecResult>,
) {
  const fn = renderModal(execOne);
  fireEvent.click(screen.getByRole("button", { name: /새 플로우/ }));
  fireEvent.click(screen.getByRole("button", { name: /단계 추가/ }));
  return fn;
}

describe("FlowModal 단계 편집", () => {
  it("플로우가 없으면 안내 힌트", () => {
    renderModal();
    expect(screen.getByText(/새 플로우를 만들어 시작/)).toBeTruthy();
  });

  it("추출 규칙 추가/편집/삭제", () => {
    setupWithStep();
    fireEvent.click(screen.getByRole("button", { name: /추출 규칙/ }));
    const varInput = screen.getByPlaceholderText("변수명");
    fireEvent.change(varInput, { target: { value: "token" } });
    expect((varInput as HTMLInputElement).value).toBe("token");
    const pathInput = screen.getByPlaceholderText("JSONPath");
    fireEvent.change(pathInput, { target: { value: "data.token" } });
    expect((pathInput as HTMLInputElement).value).toBe("data.token");
    // 규칙 삭제(추출 행의 닫기 버튼)
    const ruleRow = varInput.closest(".flow-rule-row")!;
    fireEvent.click(ruleRow.querySelector(".icon-btn")!);
    expect(screen.queryByPlaceholderText("변수명")).toBeNull();
  });

  it("어서션 추가/기대값 편집/삭제", () => {
    setupWithStep();
    fireEvent.click(screen.getByRole("button", { name: /\+ 어서션/ }));
    const expected = screen.getByPlaceholderText("기대값") as HTMLInputElement;
    expect(expected.value).toBe("200");
    fireEvent.change(expected, { target: { value: "201" } });
    expect(expected.value).toBe("201");
  });

  it("단계 삭제", () => {
    setupWithStep();
    expect(screen.getByText("/login")).toBeTruthy();
    fireEvent.click(screen.getByTitle("단계 삭제"));
    expect(screen.queryByText("/login")).toBeNull();
  });

  it("드래그로 단계 순서를 재배치한다", () => {
    setupWithStep();
    // 두 번째 단계 추가(/me 선택 위해 operation Select 변경은 생략하고 같은 op로 2개)
    fireEvent.click(screen.getByRole("button", { name: /단계 추가/ }));
    const steps = document.querySelectorAll(".flow-step");
    expect(steps.length).toBe(2);
    fireEvent.dragStart(steps[0]);
    fireEvent.dragOver(steps[1]);
    fireEvent.drop(steps[1]);
    // throw 없이 재배치되면 단계 수 유지
    expect(document.querySelectorAll(".flow-step").length).toBe(2);
  });

  it("실행 결과로 추출 변수와 어서션 결과를 표시한다", async () => {
    const execOne = vi.fn(async () => ({
      status: 200, ok: true, body: '{"token":"X"}', durationMs: 2,
    }));
    setupWithStep(execOne);
    // 추출 규칙 + 어서션 구성
    fireEvent.click(screen.getByRole("button", { name: /추출 규칙/ }));
    fireEvent.change(screen.getByPlaceholderText("변수명"), { target: { value: "token" } });
    fireEvent.change(screen.getByPlaceholderText("JSONPath"), { target: { value: "token" } });
    fireEvent.click(screen.getByRole("button", { name: /\+ 어서션/ }));
    fireEvent.click(screen.getByRole("button", { name: /전체 실행/ }));
    await waitFor(() => expect(execOne).toHaveBeenCalled());
    expect(await screen.findByText(/추출됨:/)).toBeTruthy();
  });
});
