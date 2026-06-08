// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProjectsModal, type ProjectEntry } from "./ProjectsModal";

const PROJECTS: ProjectEntry[] = [
  { url: "https://a.com/api-docs", title: "A 서비스" },
  { url: "https://b.com/api-docs", title: "B 서비스" },
];

function setup(over: Partial<Parameters<typeof ProjectsModal>[0]> = {}) {
  const props = {
    projects: PROJECTS,
    activeUrl: PROJECTS[0].url,
    onUpdate: vi.fn(),
    onLoad: vi.fn(),
    onDelete: vi.fn(),
    onAdd: vi.fn(),
    onImportFile: vi.fn().mockResolvedValue(""),
    onReimportFile: vi.fn().mockResolvedValue(""),
    onClose: vi.fn(),
    ...over,
  };
  render(<ProjectsModal {...props} />);
  return props;
}

describe("ProjectsModal", () => {
  it("프로젝트 목록을 렌더한다", () => {
    setup();
    expect(screen.getByDisplayValue("A 서비스")).toBeTruthy();
    expect(screen.getByDisplayValue("https://b.com/api-docs")).toBeTruthy();
  });

  it("빈 목록이면 안내 힌트를 표시", () => {
    setup({ projects: [] });
    expect(screen.getByText(/저장된 프로젝트가 없습니다/)).toBeTruthy();
  });

  it("이름 인라인 편집이 onUpdate 호출", () => {
    const { onUpdate } = setup();
    fireEvent.change(screen.getByDisplayValue("A 서비스"), { target: { value: "A2" } });
    expect(onUpdate).toHaveBeenCalledWith([
      { ...PROJECTS[0], title: "A2" },
      PROJECTS[1],
    ]);
  });

  it("열기 버튼이 onLoad 호출", () => {
    const { onLoad } = setup();
    fireEvent.click(screen.getAllByText("열기")[1]);
    expect(onLoad).toHaveBeenCalledWith(PROJECTS[1].url);
  });

  it("삭제 버튼이 onDelete 호출", () => {
    const { onDelete } = setup();
    fireEvent.click(screen.getAllByTitle(/삭제/)[0]);
    expect(onDelete).toHaveBeenCalledWith(PROJECTS[0].url);
  });

  it("URL 없으면 추가 버튼 비활성, 입력 후 onAdd 호출(이름 비우면 URL)", () => {
    const { onAdd } = setup();
    const addBtn = screen.getByText("추가") as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/스펙 URL \(예/), {
      target: { value: "https://c.com/api-docs" },
    });
    expect(addBtn.disabled).toBe(false);
    fireEvent.click(addBtn);
    expect(onAdd).toHaveBeenCalledWith("https://c.com/api-docs", "https://c.com/api-docs");
  });

  it("Enter 키로도 추가된다", () => {
    const { onAdd } = setup();
    fireEvent.change(screen.getByPlaceholderText("이름(비우면 URL)"), { target: { value: "C" } });
    const urlInput = screen.getByPlaceholderText(/스펙 URL \(예/);
    fireEvent.change(urlInput, { target: { value: "https://c.com/api-docs" } });
    fireEvent.keyDown(urlInput, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith("C", "https://c.com/api-docs");
  });

  it("'파일에서 가져오기' 클릭 시 onImportFile 호출 후 메시지 표시", async () => {
    const onImportFile = vi.fn().mockResolvedValue("'api.yaml'을(를) 가져왔습니다.");
    setup({ onImportFile });
    fireEvent.click(screen.getByText("파일에서 가져오기"));
    await waitFor(() => expect(onImportFile).toHaveBeenCalled());
    expect(screen.getByText(/가져왔습니다/)).toBeTruthy();
  });

  it("파일 프로젝트 행은 파일명을 읽기전용 표시 + '다시 가져오기' 버튼, URL 입력 없음", () => {
    setup({
      projects: [{ url: "swaggerman:file:abc", title: "내 파일 API", fileName: "petstore.yaml" }],
      activeUrl: "swaggerman:file:abc",
    });
    expect(screen.getByText(/petstore\.yaml/)).toBeTruthy();
    expect(screen.getByText("다시 가져오기")).toBeTruthy();
    expect(screen.queryByDisplayValue("swaggerman:file:abc")).toBeNull();
  });
});
