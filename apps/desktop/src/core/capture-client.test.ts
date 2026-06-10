// src/core/capture-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import { startCapture, stopCapture, getCaptureRecordings, getCaptureStatus } from "./capture-client";

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
});

describe("capture-client", () => {
  it("startCapture는 capture_start에 startUrl을 전달한다", async () => {
    await startCapture("https://svc.example.com");
    expect(invokeMock).toHaveBeenCalledWith("capture_start", { startUrl: "https://svc.example.com" });
  });

  it("stopCapture는 capture_stop을 호출한다", async () => {
    await stopCapture();
    expect(invokeMock).toHaveBeenCalledWith("capture_stop");
  });

  it("getCaptureRecordings는 녹화 배열을 반환한다", async () => {
    invokeMock.mockResolvedValue([{ atMs: 1, method: "GET", path: "/x", status: 200, responseBody: "{}" }]);
    const recs = await getCaptureRecordings();
    expect(invokeMock).toHaveBeenCalledWith("capture_recordings");
    expect(recs).toHaveLength(1);
  });

  it("getCaptureStatus는 실행 여부를 반환한다", async () => {
    invokeMock.mockResolvedValue(true);
    expect(await getCaptureStatus()).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("capture_status");
  });
});
