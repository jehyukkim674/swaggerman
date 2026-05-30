import { describe, it, expect } from "vitest";
import { computeSecurityHeaders } from "./security";
import type { ParsedSecurityScheme } from "./types";

const schemes: ParsedSecurityScheme[] = [
  { name: "bearerAuth", kind: { kind: "http", scheme: "bearer" } },
  { name: "basicAuth", kind: { kind: "http", scheme: "basic" } },
  { name: "apiKey", kind: { kind: "apiKey", name: "X-API-Key", location: "header" } },
  { name: "queryKey", kind: { kind: "apiKey", name: "k", location: "query" } },
];

describe("computeSecurityHeaders", () => {
  it("http bearer → Authorization: Bearer", () => {
    const h = computeSecurityHeaders(schemes, { bearerAuth: "TOKEN" });
    expect(h.Authorization).toBe("Bearer TOKEN");
  });

  it("이미 Bearer 접두사가 있으면 중복하지 않음", () => {
    const h = computeSecurityHeaders(schemes, { bearerAuth: "Bearer TOKEN" });
    expect(h.Authorization).toBe("Bearer TOKEN");
  });

  it("apiKey(header) → 지정 헤더", () => {
    const h = computeSecurityHeaders(schemes, { apiKey: "secret" });
    expect(h["X-API-Key"]).toBe("secret");
  });

  it("apiKey(query)는 헤더에 넣지 않음", () => {
    const h = computeSecurityHeaders(schemes, { queryKey: "v" });
    expect(h.k).toBeUndefined();
  });

  it("빈 값은 무시", () => {
    const h = computeSecurityHeaders(schemes, { bearerAuth: "  " });
    expect(h.Authorization).toBeUndefined();
  });
});
