import { describe, it, expect } from "vitest";
import {
  buildTokenForm,
  parseTokenResponse,
  fetchOAuth2Token,
  emptyOAuth2Config,
  type OAuth2Config,
} from "./oauth2";
import type { HTTPResponse } from "./types";

function cfg(partial: Partial<OAuth2Config>): OAuth2Config {
  return { ...emptyOAuth2Config(), ...partial };
}

describe("buildTokenForm", () => {
  it("client_credentials 폼", () => {
    const form = buildTokenForm(
      cfg({ grant: "client_credentials", clientId: "id", clientSecret: "sec", scope: "read" }),
    );
    const p = new URLSearchParams(form);
    expect(p.get("grant_type")).toBe("client_credentials");
    expect(p.get("client_id")).toBe("id");
    expect(p.get("client_secret")).toBe("sec");
    expect(p.get("scope")).toBe("read");
    expect(p.has("username")).toBe(false);
  });

  it("password 폼은 username/password 포함", () => {
    const form = buildTokenForm(cfg({ grant: "password", username: "u", password: "p" }));
    const p = new URLSearchParams(form);
    expect(p.get("grant_type")).toBe("password");
    expect(p.get("username")).toBe("u");
    expect(p.get("password")).toBe("p");
  });

  it("특수문자를 인코딩한다", () => {
    const form = buildTokenForm(cfg({ clientSecret: "a b&c" }));
    expect(form).toContain("client_secret=a+b%26c");
  });
});

describe("parseTokenResponse", () => {
  it("access_token 추출", () => {
    const r = parseTokenResponse(JSON.stringify({ access_token: "T", token_type: "Bearer" }));
    expect(r).toEqual({
      accessToken: "T",
      tokenType: "Bearer",
      raw: '{"access_token":"T","token_type":"Bearer"}',
    });
  });

  it("token_type 없으면 Bearer 기본값", () => {
    const r = parseTokenResponse(JSON.stringify({ access_token: "T" }));
    expect(r?.tokenType).toBe("Bearer");
  });

  it("access_token 없거나 JSON 아니면 null", () => {
    expect(parseTokenResponse(JSON.stringify({ error: "x" }))).toBeNull();
    expect(parseTokenResponse("not json")).toBeNull();
  });
});

describe("fetchOAuth2Token", () => {
  const ok: HTTPResponse = {
    statusCode: 200,
    headers: {},
    body: JSON.stringify({ access_token: "ABC", token_type: "Bearer" }),
    durationMs: 1,
    size: 0,
  };

  it("성공 시 토큰 반환 + 올바른 요청 구성", async () => {
    let captured: { url: string; body?: string; ct?: string } | null = null;
    const r = await fetchOAuth2Token(cfg({ tokenUrl: "https://auth/token", clientId: "i" }), async (req) => {
      captured = { url: req.url, body: req.body, ct: req.headers["Content-Type"] };
      return ok;
    });
    expect(r.accessToken).toBe("ABC");
    expect(captured!.url).toBe("https://auth/token");
    expect(captured!.ct).toBe("application/x-www-form-urlencoded");
    expect(captured!.body).toContain("grant_type=client_credentials");
  });

  it("tokenUrl 비면 에러", async () => {
    await expect(fetchOAuth2Token(cfg({}), async () => ok)).rejects.toThrow("Token URL");
  });

  it("토큰 없으면 에러", async () => {
    const bad: HTTPResponse = { ...ok, statusCode: 401, body: '{"error":"invalid"}' };
    await expect(
      fetchOAuth2Token(cfg({ tokenUrl: "https://auth/token" }), async () => bad),
    ).rejects.toThrow("토큰 발급 실패");
  });
});
