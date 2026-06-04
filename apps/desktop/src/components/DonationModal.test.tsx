// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DonationModal } from "./DonationModal";
import { DONATION_URL } from "../core/donation";

describe("DonationModal", () => {
  it("QR과 후원 URL을 표시한다", () => {
    const { container } = render(<DonationModal onClose={() => {}} />);
    expect(container.querySelector("svg[aria-label]")).toBeTruthy();
    expect(screen.getByText(DONATION_URL)).toBeTruthy();
  });

  it("닫기 버튼 클릭 시 onClose 호출", () => {
    const onClose = vi.fn();
    render(<DonationModal onClose={onClose} />);
    fireEvent.click(screen.getByText("닫기"));
    expect(onClose).toHaveBeenCalled();
  });

  it("오버레이 클릭 시 onClose 호출", () => {
    const onClose = vi.fn();
    const { container } = render(<DonationModal onClose={onClose} />);
    fireEvent.mouseDown(container.querySelector(".modal-overlay")!);
    expect(onClose).toHaveBeenCalled();
  });

  it("모달 내부 클릭은 onClose를 트리거하지 않는다", () => {
    const onClose = vi.fn();
    const { container } = render(<DonationModal onClose={onClose} />);
    fireEvent.mouseDown(container.querySelector(".donation-modal")!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ESC 키로 닫힌다", () => {
    const onClose = vi.fn();
    render(<DonationModal onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
