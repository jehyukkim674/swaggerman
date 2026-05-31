import { describe, it, expect, vi, beforeEach } from "vitest";

const { invokeMock, FakeChannel } = vi.hoisted(() => {
  const invokeMock = vi.fn();
  class FakeChannel {
    onmessage: ((e: unknown) => void) | null = null;
  }
  return { invokeMock, FakeChannel };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  Channel: FakeChannel,
}));

import { claudeProvider } from "./claude";

beforeEach(() => invokeMock.mockReset());

describe("claudeProvider", () => {
  it("complete는 ai_complete를 올바른 인자로 호출한다", async () => {
    invokeMock.mockResolvedValue('{"result":"{}"}');
    const out = await claudeProvider.complete({
      prompt: "p",
      system: "s",
      model: "haiku",
      schema: "{}",
    });
    expect(out).toBe('{"result":"{}"}');
    expect(invokeMock).toHaveBeenCalledWith("ai_complete", {
      args: { prompt: "p", system: "s", model: "haiku", schema: "{}", claudePath: undefined },
    });
  });

  it("detect는 ai_detect를 호출한다", async () => {
    invokeMock.mockResolvedValue({ claude: { path: "/x", version: "v" } });
    const d = await claudeProvider.detect();
    expect(d.claude?.path).toBe("/x");
    expect(invokeMock).toHaveBeenCalledWith("ai_detect");
  });

  it("chat은 ai_chat 호출 + Channel 이벤트를 콜백으로 전달한다", () => {
    invokeMock.mockResolvedValue(undefined);
    const events: unknown[] = [];
    claudeProvider.chat(
      { reqId: 7, prompt: "p", system: "s", model: "sonnet" },
      (e) => events.push(e),
    );
    // invoke 호출 확인
    expect(invokeMock).toHaveBeenCalled();
    const [name, payload] = invokeMock.mock.calls[0];
    expect(name).toBe("ai_chat");
    // Channel을 통해 들어온 메시지를 onEvent로 전달하는지
    const ch = (payload as { onEvent: InstanceType<typeof FakeChannel> }).onEvent;
    ch.onmessage?.({ kind: "delta", text: "hi" });
    expect(events).toEqual([{ kind: "delta", text: "hi" }]);
  });

  it("chat 핸들 cancel은 ai_cancel을 호출한다", () => {
    invokeMock.mockResolvedValue(undefined);
    const handle = claudeProvider.chat(
      { reqId: 9, prompt: "p", system: "s", model: "sonnet" },
      () => {},
    );
    handle.cancel();
    expect(invokeMock).toHaveBeenCalledWith("ai_cancel", { reqId: 9 });
  });
});
