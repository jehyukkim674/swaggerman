// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadAuthConfig,
  saveAuthConfig,
  isAuthConfigured,
  headerValue,
  applyTokenHeader,
  DEFAULT_AUTH_CONFIG,
} from "./auth-flow";
import type { RequestParam } from "./request-builder";

describe("auth config 영속화", () => {
  beforeEach(() => localStorage.clear());
  it("기본값을 반환하고 저장/복원된다", () => {
    expect(loadAuthConfig("u1")).toEqual(DEFAULT_AUTH_CONFIG);
    saveAuthConfig("u1", { flowId: "f1", tokenVar: "accessToken", headerName: "Authorization", scheme: "Bearer " });
    expect(loadAuthConfig("u1").tokenVar).toBe("accessToken");
    expect(loadAuthConfig("u2")).toEqual(DEFAULT_AUTH_CONFIG); // 스펙별 분리
  });
});

describe("isAuthConfigured", () => {
  it("플로우·토큰변수·헤더가 모두 있어야 true", () => {
    expect(isAuthConfigured(DEFAULT_AUTH_CONFIG)).toBe(false); // flowId 비어있음
    expect(isAuthConfigured({ flowId: "f1", tokenVar: "t", headerName: "Authorization", scheme: "" })).toBe(true);
    expect(isAuthConfigured({ flowId: "f1", tokenVar: " ", headerName: "Authorization", scheme: "" })).toBe(false);
  });
});

describe("headerValue / applyTokenHeader", () => {
  const cfg = { flowId: "f1", tokenVar: "token", headerName: "Authorization", scheme: "Bearer " };
  it("scheme + token", () => expect(headerValue(cfg, "abc")).toBe("Bearer abc"));
  it("빈 scheme면 토큰만", () =>
    expect(headerValue({ ...cfg, scheme: "" }, "abc")).toBe("abc"));

  it("같은 이름 헤더(대소문자 무시)를 교체하고 나머지는 유지", () => {
    const headers: RequestParam[] = [
      { key: "X-Trace", value: "1", enabled: true },
      { key: "authorization", value: "Bearer old", enabled: true },
    ];
    const out = applyTokenHeader(headers, cfg, "new");
    expect(out.find((h) => h.key === "X-Trace")).toBeTruthy();
    expect(out.filter((h) => h.key.toLowerCase() === "authorization")).toHaveLength(1);
    expect(out.find((h) => h.key === "Authorization")!.value).toBe("Bearer new");
  });

  it("없으면 새로 추가", () => {
    expect(applyTokenHeader([], cfg, "t")).toEqual([
      { key: "Authorization", value: "Bearer t", enabled: true },
    ]);
  });
});
