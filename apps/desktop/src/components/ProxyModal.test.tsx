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
    if (cmd === "capture_status") return false;
    if (cmd === "capture_recordings") return [];
    return undefined;
  });
});

function renderModal(onSendToMock = vi.fn(), onSendAllToMock = vi.fn(async () => "")) {
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
        onSendAllToMock={vi.fn(async () => "")}
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
    render(<ProxyModal defaultTarget="" onSendToMock={vi.fn()} onSendAllToMock={vi.fn(async () => "")} onClose={vi.fn()} />);
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

  it("'전체 Mock으로' 클릭 시 제목 입력 후 저장하면 records와 title을 넘기고 결과를 표시한다", async () => {
    const recs: ProxyRecord[] = [
      { atMs: 1, method: "GET", path: "/pet", status: 200, responseBody: "[]" },
      { atMs: 2, method: "POST", path: "/pet", status: 201, responseBody: "{}" },
    ];
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "proxy_start") return 9091;
      if (cmd === "proxy_recordings") return recs;
      return undefined;
    });
    const onSendAll = vi.fn(async () => "Mock 저장 2건");
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
    const input = await screen.findByPlaceholderText("프리셋 제목");
    fireEvent.change(input, { target: { value: "bulk-set" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(onSendAll).toHaveBeenCalledWith(recs, "bulk-set");
    expect(await screen.findByText("Mock 저장 2건")).toBeTruthy();
  });
});

describe("ProxyModal 전체 Mock으로 제목", () => {
  it("'전체 Mock으로' 클릭 시 제목 입력이 뜨고, 제목 저장 시 records와 title을 넘긴다", async () => {
    const recs: ProxyRecord[] = [
      { atMs: 1, method: "GET", path: "/pet", status: 200, responseBody: "[]" },
    ];
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "proxy_start") return 9091;
      if (cmd === "proxy_recordings") return recs;
      return undefined;
    });
    const onSendAll = vi.fn(async () => "프리셋 'smoke' 저장 1건");
    render(
      <ProxyModal defaultTarget="https://api.example.com"
        onSendToMock={vi.fn()} onSendAllToMock={onSendAll} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    fireEvent.click(await screen.findByRole("button", { name: "전체 Mock으로" }));
    // 제목 입력 노출
    const input = await screen.findByPlaceholderText("프리셋 제목");
    fireEvent.change(input, { target: { value: "smoke" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(onSendAll).toHaveBeenCalledWith(recs, "smoke");
    expect(await screen.findByText("프리셋 'smoke' 저장 1건")).toBeTruthy();
  });

  it("제목이 비면 저장 버튼이 비활성", async () => {
    const recs: ProxyRecord[] = [{ atMs: 1, method: "GET", path: "/pet", status: 200, responseBody: "[]" }];
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "proxy_start") return 9091;
      if (cmd === "proxy_recordings") return recs;
      return undefined;
    });
    render(<ProxyModal defaultTarget="https://api.example.com"
      onSendToMock={vi.fn()} onSendAllToMock={vi.fn(async () => "")} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    fireEvent.click(await screen.findByRole("button", { name: "전체 Mock으로" }));
    expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("제목 입력 중 취소하면 '전체 Mock으로' 버튼으로 돌아간다", async () => {
    const recs: ProxyRecord[] = [{ atMs: 1, method: "GET", path: "/pet", status: 200, responseBody: "[]" }];
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "proxy_start") return 9091;
      if (cmd === "proxy_recordings") return recs;
      return undefined;
    });
    const onSendAll = vi.fn(async () => "");
    render(<ProxyModal defaultTarget="https://api.example.com"
      onSendToMock={vi.fn()} onSendAllToMock={onSendAll} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    fireEvent.click(await screen.findByRole("button", { name: "전체 Mock으로" }));
    fireEvent.change(screen.getByPlaceholderText("프리셋 제목"), { target: { value: "버릴제목" } });
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onSendAll).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "전체 Mock으로" })).toBeTruthy();
    expect(screen.queryByPlaceholderText("프리셋 제목")).toBeNull();
  });
});

describe("ProxyModal 브라우저 모드", () => {
  it("브라우저 탭 클릭 시 시작 URL 입력과 시작 버튼을 표시한다", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "브라우저" }));
    expect(screen.getByPlaceholderText("https://service.example.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "시작" })).toBeTruthy();
  });

  it("브라우저 모드 시작 시 capture_start를 호출하고 녹화를 폴링한다", async () => {
    const recs: ProxyRecord[] = [
      { atMs: 1, method: "GET", path: "/api/pets", status: 200, responseBody: "[]" },
    ];
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "capture_recordings") return recs;
      if (cmd === "capture_status") return true;
      return undefined;
    });
    const onSend = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "브라우저" }));
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("capture_start", expect.objectContaining({ startUrl: "https://api.example.com" })),
    );
    const btn = await screen.findByRole("button", { name: "Mock으로" });
    fireEvent.click(btn);
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ path: "/api/pets" }));
  });

  it("브라우저 모드 중지 시 capture_stop을 호출한다", async () => {
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "capture_status") return true;
      if (cmd === "capture_recordings") return [];
      return undefined;
    });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "브라우저" }));
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    const stop = await screen.findByRole("button", { name: "중지" });
    fireEvent.click(stop);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("capture_stop"));
  });

  it("Chrome 미발견 등 시작 실패 메시지를 표시한다", async () => {
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "capture_start") throw new Error("Chrome을 찾을 수 없습니다");
      if (cmd === "capture_status") return false;
      if (cmd === "capture_recordings") return [];
      return undefined;
    });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "브라우저" }));
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(await screen.findByText(/Chrome을 찾을 수 없습니다/)).toBeTruthy();
  });

  it("프록시 에러 후 브라우저 탭 전환 시 에러 메시지가 사라진다", async () => {
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "proxy_start") throw new Error("boom");
      if (cmd === "capture_status") return false;
      if (cmd === "capture_recordings") return [];
      return undefined;
    });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(await screen.findByText(/시작 실패/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "브라우저" }));
    expect(screen.queryByText(/시작 실패/)).toBeNull();
  });

  it("status가 false로 바뀌면(창 닫힘) 실행 표시가 사라진다", async () => {
    let status = true;
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "capture_status") return status;
      if (cmd === "capture_recordings") return [];
      return undefined;
    });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "브라우저" }));
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    await screen.findByRole("button", { name: "중지" });
    status = false; // 사용자가 Chrome 창을 닫음
    expect(await screen.findByRole("button", { name: "시작" }, { timeout: 3000 })).toBeTruthy();
  });
});
