// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import type { ParsedOperation, ParsedSpec } from "../core/types";
import type { HistoryItem } from "../core/history";
import type { NotesMap } from "../core/notes";

function mkOp(over: Partial<ParsedOperation>): ParsedOperation {
  return {
    id: over.id ?? `${over.method} ${over.path}`,
    method: "GET",
    path: "/x",
    tags: ["users"],
    parameters: [],
    responses: [],
    ...over,
  };
}

const OPS: ParsedOperation[] = [
  mkOp({ id: "op1", method: "GET", path: "/users", summary: "유저 목록", tags: ["users"] }),
  mkOp({ id: "op2", method: "POST", path: "/orders", summary: "주문 생성", tags: ["orders"] }),
];

const SPEC: ParsedSpec = {
  info: { title: "t", version: "1" },
  baseURL: "https://x",
  operations: OPS,
  securitySchemes: [],
} as unknown as ParsedSpec;

function mkHist(over: Partial<HistoryItem>): HistoryItem {
  return {
    id: over.id ?? "h1",
    opId: "op1",
    method: "GET",
    path: "/users",
    url: "https://x/users",
    status: 200,
    durationMs: 12,
    size: 100,
    executedAt: Date.now(),
    inputs: { pathParams: {}, queryParams: [], headers: [], body: "" },
    responseHeaders: {},
    responseBody: "",
    ...over,
  };
}

function setup(over: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const props: Parameters<typeof Sidebar>[0] = {
    spec: SPEC,
    loading: false,
    error: null,
    selectedId: null,
    onSelect: vi.fn(),
    favorites: [],
    onToggleFavorite: vi.fn(),
    history: [],
    onSelectHistory: vi.fn(),
    onReplayHistory: vi.fn(),
    onDeleteHistory: vi.fn(),
    onClearHistory: vi.fn(),
    selectedHistoryId: null,
    onCompareHistory: vi.fn(),
    notes: {} as NotesMap,
    ...over,
  };
  render(<Sidebar {...props} />);
  return props;
}

describe("Sidebar - API 탭", () => {
  it("태그별로 오퍼레이션을 그룹핑해 표시한다", () => {
    setup();
    expect(screen.getByText("/users")).toBeTruthy();
    expect(screen.getByText("/orders")).toBeTruthy();
    expect(screen.getByText("users")).toBeTruthy();
    expect(screen.getByText("orders")).toBeTruthy();
  });

  it("검색어로 필터링한다", () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("검색…"), { target: { value: "orders" } });
    expect(screen.getByText("/orders")).toBeTruthy();
    expect(screen.queryByText("/users")).toBeNull();
  });

  it("메서드 필터 토글로 GET만 남긴다", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "GET" }));
    expect(screen.getByText("/users")).toBeTruthy();
    expect(screen.queryByText("/orders")).toBeNull();
  });

  it("오퍼레이션 클릭 시 onSelect 호출", () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByText("/users"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "op1" }));
  });

  it("별 클릭 시 즐겨찾기 토글(onSelect는 막힘)", () => {
    const { onToggleFavorite, onSelect } = setup();
    const usersRow = screen.getByText("/users").closest(".op-row") as HTMLElement;
    fireEvent.click(within(usersRow).getByTitle("즐겨찾기 추가"));
    expect(onToggleFavorite).toHaveBeenCalledWith("op1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("즐겨찾기는 별도 섹션으로 표시", () => {
    setup({ favorites: ["op1"] });
    expect(screen.getByText("★ 즐겨찾기")).toBeTruthy();
  });

  it("메모/상태가 있으면 점·메모 아이콘을 표시", () => {
    setup({
      notes: { op1: { text: "확인 필요", status: "deprecated", updatedAt: 1 } },
    });
    expect(screen.getByTitle("메모 있음")).toBeTruthy();
    expect(screen.getByTitle("⚠️ Deprecated")).toBeTruthy();
  });

  it("로딩/에러/빈 상태 힌트", () => {
    setup({ spec: null, loading: true });
    expect(screen.getByText("로딩 중…")).toBeTruthy();
  });

  it("spec이 없고 에러도 없으면 안내 힌트", () => {
    setup({ spec: null });
    expect(screen.getByText(/spec URL을 입력/)).toBeTruthy();
  });
});

describe("Sidebar - 히스토리 탭", () => {
  it("히스토리가 비면 안내 힌트", () => {
    setup({ history: [] });
    fireEvent.click(screen.getByText("히스토리"));
    expect(screen.getByText(/여기에 기록됩니다/)).toBeTruthy();
  });

  it("히스토리 항목과 탭 배지를 표시한다", () => {
    setup({ history: [mkHist({ id: "h1" }), mkHist({ id: "h2", path: "/orders" })] });
    expect(screen.getByText("2")).toBeTruthy(); // 탭 배지
    fireEvent.click(screen.getByText("히스토리"));
    expect(screen.getByText("2개 요청")).toBeTruthy();
  });

  it("항목 클릭 시 onSelectHistory 호출", () => {
    const { onSelectHistory } = setup({ history: [mkHist({ id: "h1" })] });
    fireEvent.click(screen.getByText("히스토리"));
    fireEvent.click(screen.getByText("/users"));
    expect(onSelectHistory).toHaveBeenCalled();
  });

  it("다시 실행/삭제 버튼", () => {
    const { onReplayHistory, onDeleteHistory } = setup({ history: [mkHist({ id: "h1" })] });
    fireEvent.click(screen.getByText("히스토리"));
    fireEvent.click(screen.getByTitle("다시 실행"));
    fireEvent.click(screen.getByTitle("삭제"));
    expect(onReplayHistory).toHaveBeenCalled();
    expect(onDeleteHistory).toHaveBeenCalledWith("h1");
  });

  it("전체 삭제 버튼", () => {
    const { onClearHistory } = setup({ history: [mkHist({ id: "h1" })] });
    fireEvent.click(screen.getByText("히스토리"));
    fireEvent.click(screen.getByText("전체 삭제"));
    expect(onClearHistory).toHaveBeenCalled();
  });

  it("두 항목을 체크하면 비교 버튼이 활성화되어 onCompareHistory 호출", () => {
    const { onCompareHistory } = setup({
      history: [mkHist({ id: "h1" }), mkHist({ id: "h2", path: "/orders" })],
    });
    fireEvent.click(screen.getByText("히스토리"));
    const checks = screen.getAllByTitle(/비교 대상으로 선택/);
    fireEvent.click(checks[0]);
    fireEvent.click(checks[1]);
    const compareBtn = screen.getByText(/비교 \(2\/2\)/);
    expect((compareBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(compareBtn);
    expect(onCompareHistory).toHaveBeenCalled();
  });
});
