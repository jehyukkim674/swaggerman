// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EnvironmentsModal } from "./EnvironmentsModal";

const ENVS = [
  { name: "dev", baseURL: "https://dev.api", vars: [{ key: "token", value: "abc" }] },
  { name: "prod", baseURL: "https://prod.api" },
];

function setup(over: Partial<Parameters<typeof EnvironmentsModal>[0]> = {}) {
  const props = {
    envs: ENVS,
    currentBaseURL: "https://cur",
    onChange: vi.fn(),
    onApply: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<EnvironmentsModal {...props} />);
  return props;
}

describe("EnvironmentsModal", () => {
  it("환경 목록과 변수들을 렌더한다", () => {
    setup();
    expect(screen.getByDisplayValue("dev")).toBeTruthy();
    expect(screen.getByDisplayValue("https://prod.api")).toBeTruthy();
    expect(screen.getByDisplayValue("token")).toBeTruthy();
  });

  it("빈 목록이면 안내 힌트", () => {
    setup({ envs: [] });
    expect(screen.getByText(/저장된 환경이 없습니다/)).toBeTruthy();
  });

  it("'+ 환경 추가'가 현재 baseURL로 새 환경을 추가", () => {
    const { onChange } = setup({ envs: [] });
    fireEvent.click(screen.getByText("+ 환경 추가"));
    expect(onChange).toHaveBeenCalledWith([{ name: "환경 1", baseURL: "https://cur", vars: [] }]);
  });

  it("적용 버튼이 onApply + onClose 호출", () => {
    const { onApply, onClose } = setup();
    fireEvent.click(screen.getAllByText("적용")[1]);
    expect(onApply).toHaveBeenCalledWith("https://prod.api");
    expect(onClose).toHaveBeenCalled();
  });

  it("환경 삭제가 onChange 호출", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getAllByTitle("삭제")[0]);
    expect(onChange).toHaveBeenCalledWith([ENVS[1]]);
  });

  it("환경 이름/baseURL 편집이 onChange 호출", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByDisplayValue("dev"), { target: { value: "stage" } });
    expect(onChange).toHaveBeenCalledWith([{ ...ENVS[0], name: "stage" }, ENVS[1]]);
    fireEvent.change(screen.getByDisplayValue("https://dev.api"), { target: { value: "https://s.api" } });
    expect(onChange).toHaveBeenCalledWith([{ ...ENVS[0], baseURL: "https://s.api" }, ENVS[1]]);
  });

  it("변수 값 편집이 vars를 갱신", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByDisplayValue("abc"), { target: { value: "xyz" } });
    expect(onChange).toHaveBeenCalledWith([
      { ...ENVS[0], vars: [{ key: "token", value: "xyz" }] },
      ENVS[1],
    ]);
  });

  it("변수 키 편집이 해당 환경의 vars를 갱신", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByDisplayValue("token"), { target: { value: "tok" } });
    expect(onChange).toHaveBeenCalledWith([
      { ...ENVS[0], vars: [{ key: "tok", value: "abc" }] },
      ENVS[1],
    ]);
  });

  it("'+ 변수 추가'가 빈 변수 행을 추가", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getAllByText("+ 변수 추가")[1]);
    expect(onChange).toHaveBeenCalledWith([
      ENVS[0],
      { ...ENVS[1], vars: [{ key: "", value: "" }] },
    ]);
  });

  it("변수 삭제가 해당 변수를 제거", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByTitle("변수 삭제"));
    expect(onChange).toHaveBeenCalledWith([{ ...ENVS[0], vars: [] }, ENVS[1]]);
  });
});
