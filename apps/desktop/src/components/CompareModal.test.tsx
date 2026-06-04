// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { HistoryItem } from "../core/history";

// 코어 diff는 다른 에이전트 작업 중 → mock으로 고정(구현 완료 여부와 무관하게 UI 검증).
// diffLinesMarked는 모든 타입(added/removed/changed-a/changed-b/equal) 줄을 반환해
// 타입별 색상 클래스 적용을 검증할 수 있게 한다. 응답 검색 테스트를 위해 "alpha"를 포함한다.
vi.mock("../core/diff", () => ({
  diffLines: (_a: string, _b: string) => [{ type: "equal", text: "{}" }],
  diffRecords: (a: Record<string, string>, b: Record<string, string>) => {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys.map((key) => {
      const av = a[key];
      const bv = b[key];
      let status: string;
      if (av === undefined) status = "added";
      else if (bv === undefined) status = "removed";
      else if (av !== bv) status = "changed";
      else status = "same";
      return { key, a: av, b: bv, status };
    });
  },
  diffLinesMarked: (_a: string, _b: string) => [
    { type: "equal", text: '{ "shared": true,' },
    { type: "added", text: '  "added": "alpha",' },
    { type: "removed", text: '  "removed": "beta",' },
    { type: "changed-a", text: '  "changed": "old",' },
    { type: "changed-b", text: '  "changed": "new alpha",' },
    { type: "equal", text: "}" },
  ],
}));

// Minimap도 코어(buildMinimapBuckets marks 지원) 의존 → mock으로 분리.
vi.mock("./Minimap", () => ({
  Minimap: () => <div data-testid="minimap" />,
}));

import { CompareModal } from "./CompareModal";

// jsdom에는 ResizeObserver가 없음(가상 스크롤 컨테이너 높이 측정에 사용) → 스텁
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

function makeItem(over: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: "h1",
    opId: "op1",
    method: "GET",
    path: "/users/{id}",
    url: "https://api.example.com/users/1",
    status: 200,
    durationMs: 42,
    size: 100,
    executedAt: Date.now(),
    inputs: {
      pathParams: { id: "1" },
      queryParams: [{ key: "page", value: "1", enabled: true }],
      headers: [{ key: "Accept", value: "application/json", enabled: true }],
      body: "",
    },
    responseHeaders: { "content-type": "application/json" },
    responseBody: JSON.stringify({ shared: true, added: "alpha" }),
    ...over,
  };
}

function renderModal() {
  const a = makeItem({ id: "a" });
  const b = makeItem({ id: "b", inputs: { ...makeItem().inputs, pathParams: { id: "2" } } });
  return render(<CompareModal a={a} b={b} onClose={() => {}} />);
}

describe("CompareModal 2단 레이아웃·미니맵·검색·변경 구분", () => {
  it("2단 레이아웃(cmp-left/cmp-right)으로 렌더된다", () => {
    const { container } = renderModal();
    expect(container.querySelector(".cmp-columns")).toBeTruthy();
    expect(container.querySelector(".cmp-left")).toBeTruthy();
    expect(container.querySelector(".cmp-right")).toBeTruthy();
  });

  it("응답 diff 줄에 타입별 색상 클래스가 적용된다", () => {
    const { container } = renderModal();
    expect(container.querySelector(".cmp-line-added")).toBeTruthy();
    expect(container.querySelector(".cmp-line-removed")).toBeTruthy();
    expect(container.querySelector(".cmp-line-changed-a")).toBeTruthy();
    expect(container.querySelector(".cmp-line-changed-b")).toBeTruthy();
    // 부호: added=+, removed=-, changed=~
    const signs = Array.from(container.querySelectorAll(".cmp-line-sign")).map((s) => s.textContent);
    expect(signs).toContain("+");
    expect(signs).toContain("-");
    expect(signs).toContain("~");
  });

  it("검색 후 Enter 시 매치가 하이라이트되고 n/m 카운터가 표시된다", () => {
    const { container } = renderModal();
    const input = container.querySelector<HTMLInputElement>(".cmp-search-bar input.search")!;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: "alpha" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // "alpha"는 added 줄과 changed-b 줄에 등장 → 2건
    const marks = container.querySelectorAll(".cmp-diff-virtual mark.hl");
    expect(marks.length).toBeGreaterThan(0);
    // 활성 매치 1개 강조
    expect(container.querySelector(".cmp-diff-virtual mark.hl.active")).toBeTruthy();
    // n/m 카운터
    expect(container.querySelector(".cmp-search-bar .match")?.textContent).toMatch(/1\/\d+/);
  });

  it("매치가 없으면 '일치 없음'을 표시한다", () => {
    const { container } = renderModal();
    const input = container.querySelector<HTMLInputElement>(".cmp-search-bar input.search")!;
    fireEvent.change(input, { target: { value: "zzzznope" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(container.querySelector(".cmp-search-bar .match.none")).toBeTruthy();
  });

  it("미니맵이 렌더된다", () => {
    const { getByTestId } = renderModal();
    expect(getByTestId("minimap")).toBeTruthy();
  });

  it("기존 요청 정보(파라미터 테이블)는 왼쪽에 유지된다", () => {
    const { container } = renderModal();
    // 메타 테이블 + FieldDiffTable이 왼쪽(cmp-left)에 존재
    const left = container.querySelector(".cmp-left")!;
    expect(left.querySelector(".cmp-meta")).toBeTruthy();
    expect(left.querySelectorAll(".cmp-table").length).toBeGreaterThan(1);
    // Path 파라미터(id: 1 vs 2)가 표시
    expect(left.textContent).toContain("Path 파라미터");
  });

  it("ESC 키로 모달이 닫힌다", () => {
    const onClose = vi.fn();
    render(<CompareModal a={makeItem({ id: "a" })} b={makeItem({ id: "b" })} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("검색어가 있는 상태에서 검색창 ESC는 검색만 지우고 모달은 닫지 않는다", () => {
    const onClose = vi.fn();
    const { container } = render(
      <CompareModal a={makeItem({ id: "a" })} b={makeItem({ id: "b" })} onClose={onClose} />,
    );
    const input = container.querySelector<HTMLInputElement>(".cmp-search-bar input.search")!;
    fireEvent.change(input, { target: { value: "alpha" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // 검색어가 있을 때 검색창에서 ESC → 검색만 초기화
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });
});

describe("CompareModal 매치 내비게이션/스크롤", () => {
  it("다음/이전 매치 버튼으로 active를 이동한다", () => {
    const { container } = renderModal();
    const input = container.querySelector<HTMLInputElement>(".cmp-search-bar input.search")!;
    fireEvent.change(input, { target: { value: "alpha" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const counter = () => container.querySelector(".cmp-search-bar .match")?.textContent;
    expect(counter()).toMatch(/1\//);
    fireEvent.click(container.querySelector('[title="다음 매치 (Enter)"]')!);
    expect(counter()).toMatch(/2\//);
    fireEvent.click(container.querySelector('[title="이전 매치 (Shift+Enter)"]')!);
    expect(counter()).toMatch(/1\//);
  });

  it("Enter 반복 시 다음 매치로 순환한다", () => {
    const { container } = renderModal();
    const input = container.querySelector<HTMLInputElement>(".cmp-search-bar input.search")!;
    fireEvent.change(input, { target: { value: "alpha" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" }); // 같은 검색어 → 다음 매치
    expect(container.querySelector(".cmp-search-bar .match")?.textContent).toMatch(/2\//);
  });

  it("검색 지우기 버튼이 검색을 초기화한다", () => {
    const { container } = renderModal();
    const input = container.querySelector<HTMLInputElement>(".cmp-search-bar input.search")!;
    fireEvent.change(input, { target: { value: "alpha" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(container.querySelector('[aria-label="검색 지우기"]')!);
    expect(input.value).toBe("");
    expect(container.querySelector(".cmp-search-bar .match")).toBeNull();
  });

  it("가상 스크롤 컨테이너 스크롤 시 throw 없이 갱신", () => {
    const { container } = renderModal();
    const virtual = container.querySelector(".cmp-diff-virtual")!;
    expect(() => fireEvent.scroll(virtual, { target: { scrollTop: 200 } })).not.toThrow();
  });
});
