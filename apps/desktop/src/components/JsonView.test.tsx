// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createRef } from "react";
import { render, fireEvent } from "@testing-library/react";
import { JsonView, LINE_HEIGHT } from "./JsonView";

function makeRef() {
  return createRef<HTMLDivElement>();
}

describe("JsonView 가상 스크롤", () => {
  it("수만 줄이어도 보이는 영역의 줄만 DOM으로 렌더링한다", () => {
    const lines = Array.from({ length: 50000 }, (_, i) => `"line${i}": ${i},`);
    const ref = makeRef();
    const { container } = render(
      <JsonView lines={lines} query="" active={0} lineMatchStarts={new Map()} containerRef={ref} />,
    );
    const count = container.querySelectorAll(".code-line").length;
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(300);
  });

  it("스크롤하면 해당 위치의 줄이 렌더링된다", () => {
    const lines = Array.from({ length: 50000 }, (_, i) => `row-${i}`);
    const ref = makeRef();
    const { container } = render(
      <JsonView lines={lines} query="" active={0} lineMatchStarts={new Map()} containerRef={ref} />,
    );
    const view = ref.current as HTMLDivElement;
    expect(container.textContent).toContain("row-1");
    expect(container.textContent).not.toContain("row-25000");

    Object.defineProperty(view, "scrollTop", { value: LINE_HEIGHT * 25000, configurable: true });
    fireEvent.scroll(view);

    expect(container.textContent).toContain("row-25000");
    expect(container.textContent).not.toContain("row-1\n");
  });

  it("응답(줄 배열)이 바뀌면 스크롤을 맨 위로 리셋한다", () => {
    const oldLines = Array.from({ length: 50000 }, (_, i) => `old-${i}`);
    const ref = makeRef();
    const { container, rerender } = render(
      <JsonView lines={oldLines} query="" active={0} lineMatchStarts={new Map()} containerRef={ref} />,
    );
    const view = ref.current as HTMLDivElement;
    // 깊이 스크롤한 상태를 만든 뒤
    Object.defineProperty(view, "scrollTop", {
      value: LINE_HEIGHT * 25000,
      writable: true,
      configurable: true,
    });
    fireEvent.scroll(view);
    expect(container.textContent).toContain("old-25000");

    // 새(짧은) 응답으로 교체되면 stale scrollTop 없이 첫 줄부터 보여야 한다
    const newLines = Array.from({ length: 50 }, (_, i) => `new-${i}`);
    rerender(
      <JsonView lines={newLines} query="" active={0} lineMatchStarts={new Map()} containerRef={ref} />,
    );
    expect(view.scrollTop).toBe(0);
    expect(container.textContent).toContain("new-0");
  });

  it("검색 매치에 글로벌 인덱스 data-match를 부여하고 active를 강조한다", () => {
    const lines = ['"a": "foo foo",', '"b": "foo",'];
    // 줄0: 매치 2개(글로벌 0,1), 줄1: 매치 1개(글로벌 2)
    const lineMatchStarts = new Map<number, number>([
      [0, 0],
      [1, 2],
    ]);
    const ref = makeRef();
    const { container } = render(
      <JsonView lines={lines} query="foo" active={1} lineMatchStarts={lineMatchStarts} containerRef={ref} />,
    );
    const marks = container.querySelectorAll("mark[data-match]");
    expect(marks).toHaveLength(3);
    const indices = Array.from(marks).map((m) => m.getAttribute("data-match"));
    expect(indices).toEqual(["0", "1", "2"]);
    const active = container.querySelector("mark.active");
    expect(active?.getAttribute("data-match")).toBe("1");
  });

  it("JSON 구문 토큰(tk-key 등)을 렌더링한다", () => {
    const lines = ['{"name": "value"}'];
    const ref = makeRef();
    const { container } = render(
      <JsonView lines={lines} query="" active={0} lineMatchStarts={new Map()} containerRef={ref} />,
    );
    expect(container.querySelector(".tk-key")).toBeTruthy();
    expect(container.querySelector(".tk-str")).toBeTruthy();
  });
});
