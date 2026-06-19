import { describe, it, expect } from "vitest";
import { diagnosePrompt, explainPrompt, explainApiPrompt, fixRequestPrompt } from "./prompts";

describe("prompts", () => {
  it("진단 프롬프트는 원인/진단 의도를 담는다", () => {
    const p = diagnosePrompt();
    expect(p).toMatch(/진단|원인|실패/);
    expect(p.length).toBeGreaterThan(0);
  });
  it("설명 프롬프트는 요약/설명 의도를 담는다", () => {
    expect(explainPrompt()).toMatch(/요약|설명/);
  });
  it("API 설명 프롬프트는 신입용 설명·예시·실수를 모두 담는다", () => {
    const p = explainApiPrompt();
    expect(p).toMatch(/신입/);
    expect(p).toMatch(/예시/);
    expect(p).toMatch(/실수/);
  });
  it("수정 프롬프트는 원인·고친 요청 의도를 담는다", () => {
    const p = fixRequestPrompt();
    expect(p).toMatch(/원인/);
    expect(p).toMatch(/고친|제안/);
  });
});
