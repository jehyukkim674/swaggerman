// OAuth2 토큰 발급. token 엔드포인트에 form-urlencoded로 요청해 access_token을 받는다.
import type { HTTPRequest, HTTPResponse } from "./types";

export type OAuth2Grant = "client_credentials" | "password";

export interface OAuth2Config {
  tokenUrl: string;
  grant: OAuth2Grant;
  clientId: string;
  clientSecret: string;
  scope: string;
  username: string; // password grant 전용
  password: string; // password grant 전용
  targetScheme: string; // 발급한 토큰을 채울 보안 스킴 이름
}

export interface OAuth2TokenResult {
  accessToken: string;
  tokenType: string;
  raw: string;
}

export function emptyOAuth2Config(): OAuth2Config {
  return {
    tokenUrl: "",
    grant: "client_credentials",
    clientId: "",
    clientSecret: "",
    scope: "",
    username: "",
    password: "",
    targetScheme: "",
  };
}

/** grant_type에 맞는 form-urlencoded 본문을 만든다. */
export function buildTokenForm(cfg: OAuth2Config): string {
  const params: Record<string, string> = { grant_type: cfg.grant };
  if (cfg.clientId) params.client_id = cfg.clientId;
  if (cfg.clientSecret) params.client_secret = cfg.clientSecret;
  if (cfg.scope) params.scope = cfg.scope;
  if (cfg.grant === "password") {
    params.username = cfg.username;
    params.password = cfg.password;
  }
  return new URLSearchParams(params).toString();
}

/** 토큰 응답(JSON)에서 access_token을 추출한다. 실패 시 null. */
export function parseTokenResponse(body: string): OAuth2TokenResult | null {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    if (json && typeof json.access_token === "string") {
      return {
        accessToken: json.access_token,
        tokenType: typeof json.token_type === "string" ? json.token_type : "Bearer",
        raw: body,
      };
    }
  } catch {
    /* not json */
  }
  return null;
}

/** token 엔드포인트로 POST해 토큰을 발급받는다. exec은 테스트를 위해 주입한다. */
export async function fetchOAuth2Token(
  cfg: OAuth2Config,
  exec: (req: HTTPRequest) => Promise<HTTPResponse>,
): Promise<OAuth2TokenResult> {
  if (!cfg.tokenUrl) throw new Error("Token URL이 비어 있습니다.");
  const request: HTTPRequest = {
    method: "POST",
    url: cfg.tokenUrl,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: buildTokenForm(cfg),
  };
  const res = await exec(request);
  const parsed = parseTokenResponse(res.body);
  if (!parsed) {
    throw new Error(
      `토큰 발급 실패 (status ${res.statusCode}): ${res.body.slice(0, 200) || "빈 응답"}`,
    );
  }
  return parsed;
}
