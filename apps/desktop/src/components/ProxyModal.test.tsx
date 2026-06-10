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

function renderModal(onSendToMock = vi.fn(), onSendAllToMock = vi.fn(() => "")) {
  render(
    <ProxyModal
      defaultTarget="https://api.example.com"
      onSendToMock={onSendToMock}
      onSendAllToMock={onSendAllToMock}
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
    const btn = await screen.findByRole("button", { name: "Mock으로" });
    fireEvent.click(btn);
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ path: "/pet" }));
  });
});

describe("ProxyModal net prop", () => {
  it("net 설정(insecure/proxy/timeout)을 proxy_start에 전달한다", async () => {
    render(
      <ProxyModal
        defaultTarget="https://api.example.com"
        net={{ insecure: true, proxy: "http://proxy:8888", timeoutMs: 5000 }}
        onSendToMock={vi.fn()}
        onSendAllToMock={vi.fn(() => "")}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "proxy_start",
        expect.objectContaining({ insecure: true, proxy: "http://proxy:8888", timeoutMs: 5000 }),
      ),
    );
  });
});

describe("ProxyModal 추가 동작", () => {
  it("타깃이 비면 시작 버튼이 비활성", () => {
    render(<ProxyModal defaultTarget="" onSendToMock={vi.fn()} onSendAllToMock={vi.fn(() => "")} onClose={vi.fn()} />);
    expect((screen.getByRole("button", { name: "시작" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("실행 중 중지하면 proxy_stop 호출 후 시작 버튼 복귀", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    const stop = await screen.findByRole("button", { name: "중지" });
    fireEvent.click(stop);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("proxy_stop"));
    expect(await screen.findByRole("button", { name: "시작" })).toBeTruthy();
  });

  it("PORT_IN_USE 에러 시 포트 충돌 안내", async () => {
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "proxy_start") throw new Error("PORT_IN_USE: in use");
      return undefined;
    });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(await screen.findByText(/사용 중입니다/)).toBeTruthy();
  });

  it("기타 시작 실패는 '시작 실패' 메시지", async () => {
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "proxy_start") throw new Error("boom");
      return undefined;
    });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(await screen.findByText(/시작 실패: boom/)).toBeTruthy();
  });

  it("실행 중 Base URL 복사 버튼이 클립보드에 복사", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    const copyBtn = await screen.findByTitle("Base URL 복사");
    fireEvent.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith("http://localhost:9091");
  });

  it("onSendToMock 결과 메시지를 표시한다", async () => {
    const recs: ProxyRecord[] = [{ atMs: 1, method: "GET", path: "/pet", status: 200, responseBody: "[]" }];
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "proxy_start") return 9091;
      if (cmd === "proxy_recordings") return recs;
      return undefined;
    });
    renderModal(vi.fn(() => "Mock에 저장됨"));
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    const btn = await screen.findByRole("button", { name: "Mock으로" });
    fireEvent.click(btn);
    expect(screen.getByText("Mock에 저장됨")).toBeTruthy();
  });

  it("'전체 Mock으로' 클릭 시 녹화 전체를 넘기고 결과 메시지를 표시한다", async () => {
    const recs: ProxyRecord[] = [
      { atMs: 1, method: "GET", path: "/pet", status: 200, responseBody: "[]" },
      { atMs: 2, method: "POST", path: "/pet", status: 201, responseBody: "{}" },
    ];
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "proxy_start") return 9091;
      if (cmd === "proxy_recordings") return recs;
      return undefined;
    });
    const onSendAll = vi.fn(() => "Mock 저장 2건");
    render(
      <ProxyModal
        defaultTarget="https://api.example.com"
        onSendToMock={vi.fn()}
        onSendAllToMock={onSendAll}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    const btn = await screen.findByRole("button", { name: "전체 Mock으로" });
    fireEvent.click(btn);
    expect(onSendAll).toHaveBeenCalledWith(recs);
    expect(screen.getByText("Mock 저장 2건")).toBeTruthy();
  });
});
