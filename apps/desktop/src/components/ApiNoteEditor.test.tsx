// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ApiNoteEditor } from "./ApiNoteEditor";
import { emptyNote, type ApiNote } from "../core/notes";

function renderEditor(note: ApiNote = emptyNote()) {
  const onChange = vi.fn();
  const utils = render(<ApiNoteEditor note={note} onChange={onChange} />);
  return { onChange, ...utils };
}

describe("ApiNoteEditor", () => {
  it("빈 노트면 '+ 메모 추가' 접힘 버튼만 보인다", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: /메모 추가/ })).toBeTruthy();
    expect(screen.queryByPlaceholderText(/메모/)).toBeNull();
  });

  it("'+ 메모 추가'를 누르면 textarea가 펼쳐진다", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /메모 추가/ }));
    expect(screen.getByPlaceholderText(/메모/)).toBeTruthy();
  });

  it("메모가 있으면 펼친 상태로 텍스트를 표시한다", () => {
    renderEditor({ text: "백엔드 문의함", status: "review", updatedAt: 1 });
    expect((screen.getByPlaceholderText(/메모/) as HTMLTextAreaElement).value).toBe("백엔드 문의함");
  });

  it("텍스트 입력 시 onChange가 갱신된 노트로 호출된다", () => {
    const { onChange } = renderEditor({ text: "", status: "review", updatedAt: 1 });
    fireEvent.change(screen.getByPlaceholderText(/메모/), { target: { value: "새 메모" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ text: "새 메모", status: "review" }),
    );
  });

  it("상태를 바꾸면 onChange가 새 status로 호출된다", () => {
    const { onChange } = renderEditor({ text: "x", status: "none", updatedAt: 1 });
    // 공용 Select 트리거 열기 → 옵션 선택 (cselect-trigger 클릭 후 option role mouseDown)
    const trigger = document.querySelector<HTMLButtonElement>(".api-note-status .cselect-trigger")!;
    fireEvent.click(trigger);
    const option = screen.getByRole("option", { name: /사용금지/ });
    fireEvent.mouseDown(option);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: "blocked" }));
  });

  it("key가 바뀌면(다른 API로 전환) 빈 노트는 접힘 상태로 리셋된다", () => {
    // 메모 있는 노트로 렌더 → 펼침(textarea 표시)
    const onChange1 = vi.fn();
    const { unmount } = render(
      <ApiNoteEditor
        key="api-a"
        note={{ text: "API A 메모", status: "review", updatedAt: 1 }}
        onChange={onChange1}
      />,
    );
    expect(screen.getByPlaceholderText(/메모/)).toBeTruthy();
    unmount();
    cleanup();

    // key 변경 → 새 컴포넌트 마운트(빈 노트). 접힘 버튼만 보여야 함.
    const onChange2 = vi.fn();
    render(
      <ApiNoteEditor
        key="api-b"
        note={emptyNote()}
        onChange={onChange2}
      />,
    );
    expect(screen.getByRole("button", { name: /메모 추가/ })).toBeTruthy();
    expect(screen.queryByPlaceholderText(/메모/)).toBeNull();
  });
});
