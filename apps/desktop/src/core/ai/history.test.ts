// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { loadChat, saveChat, clearChat, type StoredChat } from "./history";

beforeEach(() => localStorage.clear());

const chat: StoredChat = {
  messages: [
    { role: "user", text: "안녕" },
    { role: "assistant", text: "네", usage: { input: 1, output: 2 } },
  ],
  sessionId: "s1",
  totals: { input: 1, output: 2 },
};

describe("history", () => {
  it("저장 후 같은 specUrl로 복원한다", () => {
    saveChat("http://x/api", chat);
    expect(loadChat("http://x/api")).toEqual(chat);
  });

  it("다른 specUrl은 분리된다", () => {
    saveChat("http://x/api", chat);
    expect(loadChat("http://y/api")).toBeNull();
  });

  it("저장본 없으면 null", () => {
    expect(loadChat("http://none")).toBeNull();
  });

  it("clearChat은 저장본을 비운다", () => {
    saveChat("http://x/api", chat);
    clearChat("http://x/api");
    expect(loadChat("http://x/api")).toBeNull();
  });

  it("깨진 저장본은 null로 방어한다", () => {
    localStorage.setItem("swaggerman.aichat.http://x/api", "{ not json");
    expect(loadChat("http://x/api")).toBeNull();
  });

  it("형태가 안 맞으면 null(messages 배열 아님)", () => {
    localStorage.setItem("swaggerman.aichat.http://x/api", JSON.stringify({ messages: "x" }));
    expect(loadChat("http://x/api")).toBeNull();
  });
});
