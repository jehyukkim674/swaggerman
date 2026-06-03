// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
