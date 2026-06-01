// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingOverlay } from "./LoadingOverlay";

describe("LoadingOverlay", () => {
  it("스피너와 로딩 문구, 대상 URL을 표시한다", () => {
    const { container } = render(
      <LoadingOverlay url="https://api.example.com/v3/api-docs" />,
    );
    expect(container.querySelector(".loading-overlay")).toBeTruthy();
    expect(container.querySelector(".spinner")).toBeTruthy();
    expect(screen.getByText(/프로젝트 로딩 중/)).toBeTruthy();
    expect(screen.getByText("https://api.example.com/v3/api-docs")).toBeTruthy();
  });

  it("URL이 없으면 문구만 표시한다", () => {
    const { container } = render(<LoadingOverlay url="" />);
    expect(screen.getByText(/프로젝트 로딩 중/)).toBeTruthy();
    expect(container.querySelector(".loading-url")).toBeNull();
  });
});
