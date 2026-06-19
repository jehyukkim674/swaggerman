// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const getVersionMock = vi.fn();
const listCookiesMock = vi.fn();
const clearCookiesMock = vi.fn();
const saveMock = vi.fn();
const openMock = vi.fn();
const readTextFileMock = vi.fn();
const writeTextFileMock = vi.fn();
const buildBackupMock = vi.fn();
const parseBackupMock = vi.fn();
const restoreBackupMock = vi.fn();

vi.mock("@tauri-apps/api/app", () => ({ getVersion: () => getVersionMock() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: (...a: unknown[]) => saveMock(...a),
  open: (...a: unknown[]) => openMock(...a),
}));
vi.mock("../core/fs", () => ({
  readTextFile: (...a: unknown[]) => readTextFileMock(...a),
  writeTextFile: (...a: unknown[]) => writeTextFileMock(...a),
}));
vi.mock("../core/backup", () => ({
  buildBackup: (...a: unknown[]) => buildBackupMock(...a),
  serializeBackup: (b: unknown) => JSON.stringify(b),
  parseBackup: (t: string) => parseBackupMock(t),
  restoreBackup: (...a: unknown[]) => restoreBackupMock(...a),
}));
vi.mock("../core/cookies", () => ({
  listCookies: () => listCookiesMock(),
  clearCookies: () => clearCookiesMock(),
}));

import { SettingsModal } from "./SettingsModal";
import type { NetworkSettings } from "../core/types";

const SETTINGS: NetworkSettings = { timeoutMs: 30000, insecure: false, proxy: "" };

function setup(over: Partial<Parameters<typeof SettingsModal>[0]> = {}) {
  const props = {
    settings: SETTINGS,
    onChange: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<SettingsModal {...props} />);
  return props;
}

describe("SettingsModal", () => {
  beforeEach(() => {
    getVersionMock.mockResolvedValue("0.4.4");
    listCookiesMock.mockResolvedValue([]);
    clearCookiesMock.mockResolvedValue(undefined);
    saveMock.mockReset();
    openMock.mockReset();
    readTextFileMock.mockReset();
    writeTextFileMock.mockReset();
    buildBackupMock.mockReset();
    parseBackupMock.mockReset();
    restoreBackupMock.mockReset();
  });

  it("백업 저장 시 파일에 직렬화된 백업을 쓴다", async () => {
    saveMock.mockResolvedValue("/tmp/backup.json");
    writeTextFileMock.mockResolvedValue(undefined);
    buildBackupMock.mockResolvedValue({ swaggerman: "backup", schemaVersion: 1, localStorage: {}, indexedDB: {} });
    setup();
    fireEvent.click(screen.getByText("백업 파일로 저장"));
    await waitFor(() => expect(writeTextFileMock).toHaveBeenCalled());
    expect(saveMock).toHaveBeenCalled();
    expect(screen.getByText("백업을 저장했습니다.")).toBeTruthy();
  });

  it("복원 파일 선택 시 덮어쓰기 확인 경고를 표시한다", async () => {
    openMock.mockResolvedValue("/tmp/backup.json");
    readTextFileMock.mockResolvedValue("{...}");
    parseBackupMock.mockReturnValue({ swaggerman: "backup", schemaVersion: 1, exportedAt: 0, localStorage: { a: "1" }, indexedDB: {} });
    setup();
    fireEvent.click(screen.getByText("복원(파일 선택)"));
    await waitFor(() => expect(screen.getByText(/전체 덮어쓰기/)).toBeTruthy());
    expect(parseBackupMock).toHaveBeenCalledWith("{...}");
    expect(restoreBackupMock).not.toHaveBeenCalled();
  });

  it("잘못된 복원 파일이면 에러 메시지", async () => {
    openMock.mockResolvedValue("/tmp/bad.json");
    readTextFileMock.mockResolvedValue("nope");
    parseBackupMock.mockImplementation(() => {
      throw new Error("SwaggerMan 백업 파일이 아닙니다.");
    });
    setup();
    fireEvent.click(screen.getByText("복원(파일 선택)"));
    await waitFor(() => expect(screen.getByText(/복원 실패/)).toBeTruthy());
  });

  it("네트워크 설정을 렌더하고 앱 버전을 표시한다", async () => {
    setup();
    expect((screen.getByDisplayValue("30000") as HTMLInputElement).type).toBe("number");
    await waitFor(() => expect(screen.getByText(/v0\.4\.4/)).toBeTruthy());
  });

  it("타임아웃 변경이 onChange 호출", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByDisplayValue("30000"), { target: { value: "5000" } });
    expect(onChange).toHaveBeenCalledWith({ ...SETTINGS, timeoutMs: 5000 });
  });

  it("타임아웃이 비거나 0이면 기본 30000으로 폴백", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByDisplayValue("30000"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ ...SETTINGS, timeoutMs: 30000 });
  });

  it("SSL 무시 체크박스 토글", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith({ ...SETTINGS, insecure: true });
  });

  it("프록시 URL 입력", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByPlaceholderText(/127.0.0.1:8888/), {
      target: { value: "http://127.0.0.1:1" },
    });
    expect(onChange).toHaveBeenCalledWith({ ...SETTINGS, proxy: "http://127.0.0.1:1" });
  });

  it("onClaudePathChange가 있으면 AI 섹션을 노출", () => {
    const onClaudePathChange = vi.fn();
    setup({ claudePath: "/bin/claude", onClaudePathChange });
    fireEvent.change(screen.getByDisplayValue("/bin/claude"), { target: { value: "/x/claude" } });
    expect(onClaudePathChange).toHaveBeenCalledWith("/x/claude");
  });

  it("쿠키 목록을 로드해 표시한다", async () => {
    listCookiesMock.mockResolvedValue([
      { name: "sid", value: "abc", domain: "x.com", path: "/" },
    ]);
    setup();
    await waitFor(() => expect(screen.getByText("sid")).toBeTruthy());
    expect(screen.getByText("x.com")).toBeTruthy();
  });

  it("쿠키 조회 실패 시 에러 박스", async () => {
    listCookiesMock.mockRejectedValue(new Error("쿠키 접근 불가"));
    setup();
    await waitFor(() => expect(screen.getByText("쿠키 접근 불가")).toBeTruthy());
  });

  it("'모두 삭제'가 clearCookies 후 새로고침", async () => {
    listCookiesMock.mockResolvedValue([{ name: "sid", value: "a", domain: "x", path: "/" }]);
    setup();
    await waitFor(() => expect(screen.getByText("sid")).toBeTruthy());
    listCookiesMock.mockResolvedValue([]);
    fireEvent.click(screen.getByText("모두 삭제"));
    await waitFor(() => expect(clearCookiesMock).toHaveBeenCalled());
  });

  it("onGlobalShortcutChange가 있으면 단축키 섹션 + 에러를 노출", () => {
    setup({ onGlobalShortcutChange: vi.fn(), globalShortcut: "", shortcutError: "등록 실패" });
    expect(screen.getByText("전역 단축키")).toBeTruthy();
    expect(screen.getByText("등록 실패")).toBeTruthy();
  });

  it("닫기 버튼이 onClose 호출", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByText("닫기"));
    expect(onClose).toHaveBeenCalled();
  });
});
