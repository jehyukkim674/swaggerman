import { describe, it, expect } from "vitest";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, COMPLETE_MODEL } from "./models";

describe("models", () => {
  it("대화 모델 목록은 비어있지 않다", () => {
    expect(CHAT_MODELS.length).toBeGreaterThan(0);
  });
  it("기본 대화 모델은 목록에 있다", () => {
    expect(CHAT_MODELS.map((m) => m.id)).toContain(DEFAULT_CHAT_MODEL);
  });
  it("자동완성 모델은 빠른 모델(haiku)이다", () => {
    expect(COMPLETE_MODEL).toContain("haiku");
  });
});
