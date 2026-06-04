// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DonationQR } from "./DonationQR";

describe("DonationQR", () => {
  it("기본 크기(160)로 SVG를 렌더한다", () => {
    const { container } = render(<DonationQR />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("width")).toBe("160");
    expect(svg?.getAttribute("height")).toBe("160");
  });

  it("size prop으로 크기를 지정할 수 있다", () => {
    const { container } = render(<DonationQR size={240} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("240");
  });

  it("접근성 라벨을 가진다", () => {
    const { container } = render(<DonationQR />);
    expect(container.querySelector('svg[role="img"]')?.getAttribute("aria-label")).toContain("QR");
  });
});
