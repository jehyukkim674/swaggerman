import { describe, it, expect } from "vitest";
import { buildCurl } from "./curl-builder";

describe("buildCurl", () => {
  it("메서드/URL/헤더/body 포함", () => {
    const curl = buildCurl({
      method: "POST",
      url: "https://api.com/users",
      headers: { "Content-Type": "application/json", Authorization: "Bearer T" },
      body: '{"name":"Alice"}',
    });
    expect(curl).toContain("curl -X POST 'https://api.com/users'");
    expect(curl).toContain("-H 'Content-Type: application/json'");
    expect(curl).toContain("-H 'Authorization: Bearer T'");
    expect(curl).toContain(`-d '{"name":"Alice"}'`);
  });

  it("body 없으면 -d 미포함", () => {
    const curl = buildCurl({ method: "GET", url: "https://api.com/x", headers: {} });
    expect(curl).toBe("curl -X GET 'https://api.com/x'");
  });

  it("작은따옴표 이스케이프", () => {
    const curl = buildCurl({ method: "POST", url: "https://api.com/x", headers: {}, body: "it's" });
    expect(curl).toContain(`it'\\''s`);
  });
});
