import { describe, it, expect } from "vitest";
import { isSecretHeader, toBase64Url, fromBase64Url } from "./share";

describe("isSecretHeader", () => {
  it("민감 헤더를 식별한다", () => {
    for (const k of ["Authorization", "cookie", "Set-Cookie", "X-Api-Key", "apikey", "X-Auth-Token", "password", "X-Secret"]) {
      expect(isSecretHeader(k)).toBe(true);
    }
  });
  it("일반 헤더는 민감하지 않다", () => {
    for (const k of ["Accept", "Content-Type", "User-Agent", "X-Request-Id", "Accept-Language"]) {
      expect(isSecretHeader(k)).toBe(false);
    }
  });
});

describe("base64url", () => {
  it("바이트를 URL-safe base64로 왕복한다", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const encoded = toBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/); // URL-safe: +/= 없음
    expect(fromBase64Url(encoded)).toEqual(bytes);
  });
});
