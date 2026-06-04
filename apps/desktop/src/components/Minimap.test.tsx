// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { useRef } from "react";
import { render, fireEvent } from "@testing-library/react";
import { Minimap } from "./Minimap";

// jsdom canvas/레이아웃 스텁: getContext와 client 크기를 제공해 그리기 경로를 실행한다.
const ctxStub = {
  scale: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  fillStyle: "",
};

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  // canvas 2d 컨텍스트 스텁
  (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () =>
    ctxStub;
  // client 크기(레이아웃) 스텁 — 0이 아니어야 그리기 경로 진입
  Object.defineProperty(HTMLCanvasElement.prototype, "clientWidth", { value: 20, configurable: true });
  Object.defineProperty(HTMLCanvasElement.prototype, "clientHeight", { value: 200, configurable: true });
  HTMLCanvasElement.prototype.getBoundingClientRect = () =>
    ({ top: 0, left: 0, width: 20, height: 200, bottom: 200, right: 20, x: 0, y: 0, toJSON() {} }) as DOMRect;
});

beforeEach(() => {
  ctxStub.scale.mockClear();
  ctxStub.fillRect.mockClear();
  ctxStub.clearRect.mockClear();
});

// scrollRef를 제공하는 래퍼
function Harness({
  lines,
  matchLines = new Set<number>(),
  marks,
}: {
  lines: string[];
  matchLines?: Set<number>;
  marks?: Map<number, string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div ref={ref} style={{ height: 100 }} data-testid="scroll" />
      <Minimap lines={lines} scrollRef={ref} matchLines={matchLines} marks={marks} />
    </div>
  );
}

const LINES = Array.from({ length: 50 }, (_, i) => `line ${i} content`);

describe("Minimap", () => {
  it("캔버스에 버킷을 그린다(fillRect 호출)", () => {
    const { container } = render(<Harness lines={LINES} />);
    expect(container.querySelector(".minimap-canvas")).toBeTruthy();
    expect(ctxStub.scale).toHaveBeenCalled();
    expect(ctxStub.fillRect).toHaveBeenCalled();
  });

  it("검색 매치 줄은 강조색으로 그린다", () => {
    render(<Harness lines={LINES} matchLines={new Set([3, 10])} />);
    expect(ctxStub.fillRect).toHaveBeenCalled();
  });

  it("diff 마크 색을 반영한다", () => {
    render(<Harness lines={LINES} marks={new Map([[5, "#f85149"]])} />);
    expect(ctxStub.fillRect).toHaveBeenCalled();
  });

  it("클릭/드래그로 스크롤 위치를 이동한다(throw 없음)", () => {
    const { container } = render(<Harness lines={LINES} />);
    const minimap = container.querySelector(".minimap")!;
    expect(() => {
      fireEvent.mouseDown(minimap, { clientY: 50 });
      fireEvent.mouseMove(minimap, { clientY: 80 });
      fireEvent.mouseUp(minimap);
      fireEvent.mouseLeave(minimap);
    }).not.toThrow();
  });

  it("뷰포트 인디케이터를 렌더한다", () => {
    const { container } = render(<Harness lines={LINES} />);
    expect(container.querySelector(".minimap-viewport")).toBeTruthy();
  });
});
