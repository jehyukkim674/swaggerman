import { describe, it, expect } from "vitest";
import { methodColor, statusColor } from "./method";

describe("methodColor", () => {
  it("HTTP 메서드별 색상을 반환한다", () => {
    expect(methodColor("GET")).toBe("#3fb950");
    expect(methodColor("POST")).toBe("#388bfd");
    expect(methodColor("PUT")).toBe("#d29922");
    expect(methodColor("DELETE")).toBe("#f85149");
    expect(methodColor("PATCH")).toBe("#a371f7");
  });

  it("알 수 없는 메서드는 회색 기본값", () => {
    expect(methodColor("HEAD")).toBe("#8b949e");
    expect(methodColor("OPTIONS")).toBe("#8b949e");
  });
});

describe("statusColor", () => {
  it("2xx는 초록", () => {
    expect(statusColor(200)).toBe("#3fb950");
    expect(statusColor(299)).toBe("#3fb950");
  });

  it("3xx는 노랑", () => {
    expect(statusColor(301)).toBe("#d29922");
  });

  it("4xx는 주황", () => {
    expect(statusColor(404)).toBe("#f0883e");
  });

  it("5xx는 빨강", () => {
    expect(statusColor(500)).toBe("#f85149");
  });

  it("그 외(0/1xx)는 회색", () => {
    expect(statusColor(0)).toBe("#8b949e");
    expect(statusColor(100)).toBe("#8b949e");
  });
});
