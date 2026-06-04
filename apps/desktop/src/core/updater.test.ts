import { describe, it, expect, vi, beforeEach } from "vitest";

// Tauri 플러그인 모킹: check 호출 인자와 동작을 검증한다.
const checkMock = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: (...args: unknown[]) => checkMock(...args),
}));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

import { checkUpdateStatus } from "./updater";

describe("checkUpdateStatus — 네트워크 설정 적용(사내망/프록시)", () => {
  beforeEach(() => {
    checkMock.mockReset();
  });

  it("프록시·타임아웃 설정을 check()에 전달한다", async () => {
    checkMock.mockResolvedValue(null);
    await checkUpdateStatus({ proxy: "http://proxy.corp:8080", timeoutMs: 15_000 });
    expect(checkMock).toHaveBeenCalledWith({
      proxy: "http://proxy.corp:8080",
      timeout: 15_000,
    });
  });

  it("프록시가 비어있으면 proxy 옵션을 넘기지 않는다", async () => {
    checkMock.mockResolvedValue(null);
    await checkUpdateStatus({ proxy: "", timeoutMs: 30_000 });
    const options = checkMock.mock.calls[0][0];
    expect(options.proxy).toBeUndefined();
    expect(options.timeout).toBe(30_000);
  });

  it("설정 없이 호출해도 기본 타임아웃으로 동작한다", async () => {
    checkMock.mockResolvedValue(null);
    const result = await checkUpdateStatus();
    expect(result.kind).toBe("latest");
    const options = checkMock.mock.calls[0][0];
    expect(options.timeout).toBeGreaterThan(0);
  });

  it("업데이트가 있으면 available과 버전을 반환한다", async () => {
    checkMock.mockResolvedValue({
      version: "9.9.9",
      body: "릴리스 노트",
      downloadAndInstall: vi.fn(),
    });
    const result = await checkUpdateStatus();
    expect(result.kind).toBe("available");
    if (result.kind === "available") expect(result.update.version).toBe("9.9.9");
  });

  it("네트워크 단계 실패 시 프록시 설정 힌트를 포함한다", async () => {
    checkMock.mockRejectedValue(
      new Error("error sending request for url (https://github.com/.../latest.json)"),
    );
    const result = await checkUpdateStatus();
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("error sending request");
      expect(result.message).toContain("프록시");
    }
  });
});

describe("install() 및 checkForUpdate", () => {
  beforeEach(() => checkMock.mockReset());

  it("install()이 downloadAndInstall 후 relaunch를 호출한다", async () => {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    checkMock.mockResolvedValue({ version: "1.2.3", body: "n", downloadAndInstall });
    const result = await checkUpdateStatus();
    expect(result.kind).toBe("available");
    if (result.kind === "available") {
      await result.update.install();
      expect(downloadAndInstall).toHaveBeenCalled();
      expect(relaunch).toHaveBeenCalled();
    }
  });

  it("checkForUpdate는 업데이트가 있으면 정보를, 없으면 null을 반환", async () => {
    const { checkForUpdate } = await import("./updater");
    checkMock.mockResolvedValue({ version: "2.0.0", body: "", downloadAndInstall: vi.fn() });
    expect((await checkForUpdate())?.version).toBe("2.0.0");
    checkMock.mockResolvedValue(null);
    expect(await checkForUpdate()).toBeNull();
  });
});
