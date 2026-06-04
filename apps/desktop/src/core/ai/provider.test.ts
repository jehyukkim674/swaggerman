import { describe, it, expect, vi } from "vitest";
import { getProvider } from "./provider";
import { claudeProvider } from "./claude";

describe("getProvider", () => {
  it("기본값은 claude provider", () => {
    expect(getProvider()).toBe(claudeProvider);
  });

  it("'claude'를 명시하면 claude provider", () => {
    expect(getProvider("claude")).toBe(claudeProvider);
  });

  it("알 수 없는 id는 claude로 폴백(경고 로그)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // 타입상 codex지만 PROVIDERS에 없으므로 폴백 경로를 탄다
    expect(getProvider("codex")).toBe(claudeProvider);
    warn.mockRestore();
  });
});
