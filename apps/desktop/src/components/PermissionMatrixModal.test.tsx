// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PermissionMatrixModal } from "./PermissionMatrixModal";
import type { ParsedOperation } from "../core/types";
import type { MatrixCell } from "../core/permission-matrix";

const ops: ParsedOperation[] = [
  { id: "GET /pets", method: "GET", path: "/pets", tags: [], parameters: [], responses: [] },
  { id: "POST /pets", method: "POST", path: "/pets", tags: [], parameters: [], responses: [] },
];

beforeEach(() => localStorage.clear());

function renderModal(runOne?: (opId: string, token: string) => Promise<MatrixCell>) {
  const fn = runOne ?? vi.fn(async () => ({ status: 200, ok: true, durationMs: 1 }));
  render(
    <PermissionMatrixModal
      specUrl="https://api.test/s.json"
      operations={ops}
      runOne={fn}
      onClose={vi.fn()}
    />,
  );
  return fn;
}

describe("PermissionMatrixModal 설정", () => {
  it("기본 페르소나 3개를 표시한다", () => {
    renderModal();
    expect(screen.getByDisplayValue("관리자")).toBeTruthy();
    expect(screen.getByDisplayValue("일반")).toBeTruthy();
    expect(screen.getByDisplayValue("게스트")).toBeTruthy();
  });

  it("페르소나를 추가할 수 있다", () => {
    renderModal();
    const before = screen.getAllByPlaceholderText("토큰 (Bearer 자동)").length;
    fireEvent.click(screen.getByRole("button", { name: /페르소나 추가/ }));
    expect(screen.getAllByPlaceholderText("토큰 (Bearer 자동)").length).toBe(before + 1);
  });

  it("GET API는 기본 체크, 비-GET은 미체크다", () => {
    renderModal();
    const checks = screen.getAllByRole("checkbox");
    // GET /pets 체크박스는 checked, POST /pets는 unchecked
    const getCheck = checks.find(
      (c) => c.getAttribute("data-opid") === "GET /pets",
    ) as HTMLInputElement;
    const postCheck = checks.find(
      (c) => c.getAttribute("data-opid") === "POST /pets",
    ) as HTMLInputElement;
    expect(getCheck.checked).toBe(true);
    expect(postCheck.checked).toBe(false);
  });
});

describe("PermissionMatrixModal 실행", () => {
  it("실행하면 runOne을 호출하고 결과 표에 상태코드를 표시한다", async () => {
    const runOne = vi.fn(async (_opId: string, token: string): Promise<MatrixCell> => ({
      status: token ? 200 : 401,
      ok: !!token,
      durationMs: 3,
    }));
    render(
      <PermissionMatrixModal
        specUrl="https://api.test/s.json"
        operations={ops}
        runOne={runOne}
        onClose={vi.fn()}
      />,
    );
    // 관리자 토큰 입력
    const tokens = screen.getAllByPlaceholderText("토큰 (Bearer 자동)");
    fireEvent.change(tokens[0], { target: { value: "ADMIN" } });
    // 실행 (GET /pets만 기본 체크 → 쓰기 경고 없음)
    fireEvent.click(screen.getByRole("button", { name: "실행" }));
    // 결과 표에 상태코드 표시
    await waitFor(() => {
      expect(screen.getAllByText("200").length).toBeGreaterThan(0); // 관리자 셀
      expect(screen.getAllByText("401").length).toBeGreaterThan(0); // 빈 토큰 셀
    });
    expect(runOne).toHaveBeenCalled();
  });

  it("비-GET 체크 후 실행하면 확인 다이얼로그를 띄운다", async () => {
    renderModal();
    // POST /pets 체크
    const checks = screen.getAllByRole("checkbox");
    const postCheck = checks.find(
      (c) => c.getAttribute("data-opid") === "POST /pets",
    ) as HTMLInputElement;
    fireEvent.click(postCheck);
    fireEvent.click(screen.getByRole("button", { name: "실행" }));
    expect(await screen.findByText(/쓰기 요청.*전송/)).toBeTruthy();
  });
});
