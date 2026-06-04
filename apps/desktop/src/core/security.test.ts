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

describe("computeSecurityHeaders - 추가 케이스", () => {
  it("http basic → Authorization: Basic", () => {
    const h = computeSecurityHeaders(schemes, { basicAuth: "Zm9v" });
    expect(h.Authorization).toBe("Basic Zm9v");
  });

  it("이미 Basic 접두사가 있으면 중복하지 않음", () => {
    const h = computeSecurityHeaders(schemes, { basicAuth: "Basic Zm9v" });
    expect(h.Authorization).toBe("Basic Zm9v");
  });

  it("기타 http 스킴은 값 그대로 Authorization", () => {
    const custom: ParsedSecurityScheme[] = [
      { name: "digestAuth", kind: { kind: "http", scheme: "digest" } },
    ];
    const h = computeSecurityHeaders(custom, { digestAuth: "abc" });
    expect(h.Authorization).toBe("abc");
  });

  it("oauth2/openIdConnect/unknown 스킴은 헤더를 만들지 않는다", () => {
    const others: ParsedSecurityScheme[] = [
      { name: "o", kind: { kind: "oauth2" } },
      { name: "i", kind: { kind: "openIdConnect" } },
      { name: "u", kind: { kind: "unknown" } },
    ];
    const h = computeSecurityHeaders(others, { o: "x", i: "y", u: "z" });
    expect(Object.keys(h)).toHaveLength(0);
  });
});

describe("schemeHint", () => {
  it("종류별 사람이 읽는 힌트를 반환", async () => {
    const { schemeHint } = await import("./security");
    expect(schemeHint({ name: "k", kind: { kind: "apiKey", name: "X-K", location: "header" } })).toBe(
      "API Key · header · X-K",
    );
    expect(schemeHint({ name: "b", kind: { kind: "http", scheme: "bearer" } })).toBe("HTTP bearer");
    expect(schemeHint({ name: "o", kind: { kind: "oauth2" } })).toBe("OAuth2");
    expect(schemeHint({ name: "i", kind: { kind: "openIdConnect" } })).toBe("OpenID Connect");
    expect(schemeHint({ name: "u", kind: { kind: "unknown" } })).toBe("unknown");
  });
});
