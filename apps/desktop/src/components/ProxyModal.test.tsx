// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import { ProxyModal } from "./ProxyModal";
import type { ProxyRecord } from "../core/proxy-client";

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: unknown) => {
    if (cmd === "proxy_start") return 9091;
    if (cmd === "proxy_recordings") return [] as ProxyRecord[];
    return undefined;
  });
});

function renderModal(onSendToMock = vi.fn()) {
  render(
    <ProxyModal
      defaultTarget="https://api.example.com"
      onSendToMock={onSendToMock}
      onClose={vi.fn()}
    />,
  );
  return onSendToMock;
}

describe("ProxyModal", () => {
  it("타깃 URL 기본값과 시작 버튼을 표시한다", () => {
    renderModal();
    expect(screen.getByDisplayValue("https://api.example.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "시작" })).toBeTruthy();
  });

  it("시작하면 proxy_start를 호출하고 실행 상태를 표시한다", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("proxy_start", expect.anything()));
    expect(await screen.findByText(/실행 중/)).toBeTruthy();
  });

  it("녹화 항목의 'Mock으로' 클릭 시 onSendToMock을 호출한다", async () => {
    const recs: ProxyRecord[] = [{ atMs: 1, method: "GET", path: "/pet", status: 200, responseBody: "[]" }];
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "proxy_start") return 9091;
      if (cmd === "proxy_recordings") return recs;
      return undefined;
    });
    const onSend = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    // 폴링으로 녹화가 뜨면 Mock으로 버튼 노출
    const btn = await screen.findByRole("button", { name: /Mock으로/ });
    fireEvent.click(btn);
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ path: "/pet" }));
  });
});
