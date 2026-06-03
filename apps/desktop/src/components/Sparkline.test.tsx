// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Sparkline } from "./Sparkline";

describe("Sparkline", () => {
  it("값 배열로 polyline points를 만든다", () => {
    const { container } = render(<Sparkline values={[10, 20, 15, 30]} />);
    const poly = container.querySelector("polyline");
    expect(poly).toBeTruthy();
    // 4개 점 → "x,y x,y x,y x,y" (공백 3개)
    expect(poly!.getAttribute("points")!.trim().split(/\s+/).length).toBe(4);
  });
  it("빈 배열은 polyline 없음", () => {
    const { container } = render(<Sparkline values={[]} />);
    expect(container.querySelector("polyline")).toBeNull();
  });
  it("단일 값은 수평선(점 2개 또는 1개)", () => {
    const { container } = render(<Sparkline values={[42]} />);
    const poly = container.querySelector("polyline");
    expect(poly).toBeTruthy();
  });
  it("color prop을 stroke에 적용", () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} color="#f85149" />);
    expect(container.querySelector("polyline")!.getAttribute("stroke")).toBe("#f85149");
  });
});
