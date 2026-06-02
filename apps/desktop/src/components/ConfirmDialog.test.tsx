// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

function renderDialog() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      title="새 창 열기"
      message="추가로 SwaggerMan 창을 생성하시겠습니까?"
      confirmLabel="새 창 열기"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("제목과 메시지를 표시한다", () => {
    renderDialog();
    expect(screen.getByText("새 창 열기", { selector: ".confirm-title" })).toBeTruthy();
    expect(screen.getByText("추가로 SwaggerMan 창을 생성하시겠습니까?")).toBeTruthy();
  });

  it("확인 버튼 클릭 시 onConfirm을 호출한다", () => {
    const { onConfirm, onCancel } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "새 창 열기" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("취소 버튼 클릭 시 onCancel을 호출한다", () => {
    const { onConfirm, onCancel } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Escape 키로 onCancel을 호출한다", () => {
    const { onCancel } = renderDialog();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("배경(오버레이) 클릭 시 onCancel을 호출한다", () => {
    const { onCancel } = renderDialog();
    fireEvent.mouseDown(document.querySelector(".modal-overlay")!);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("다이얼로그 내부 클릭은 닫히지 않는다", () => {
    const { onCancel } = renderDialog();
    fireEvent.mouseDown(document.querySelector(".confirm-dialog")!);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
