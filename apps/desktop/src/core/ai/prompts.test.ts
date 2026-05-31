import { describe, it, expect } from "vitest";
import { diagnosePrompt, explainPrompt } from "./prompts";

describe("prompts", () => {
  it("진단 프롬프트는 원인/진단 의도를 담는다", () => {
    const p = diagnosePrompt();
    expect(p).toMatch(/진단|원인|실패/);
    expect(p.length).toBeGreaterThan(0);
  });
  it("설명 프롬프트는 요약/설명 의도를 담는다", () => {
    expect(explainPrompt()).toMatch(/요약|설명/);
  });
});
