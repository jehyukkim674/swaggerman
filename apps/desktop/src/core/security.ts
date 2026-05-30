// 보안 스킴 + 사용자 입력값 → 요청 헤더 계산. macOS 앱 computedSecurityHeaders 포팅.
import type { ParsedSecurityScheme } from "./types";

export function computeSecurityHeaders(
  schemes: ParsedSecurityScheme[],
  values: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const scheme of schemes) {
    const value = (values[scheme.name] ?? "").trim();
    if (!value) continue;
    const kind = scheme.kind;
    switch (kind.kind) {
      case "apiKey":
        if (kind.location === "header") headers[kind.name] = value;
        break;
      case "http":
        if (kind.scheme.toLowerCase() === "bearer") {
          headers["Authorization"] = value.toLowerCase().startsWith("bearer ")
            ? value
            : `Bearer ${value}`;
        } else if (kind.scheme.toLowerCase() === "basic") {
          headers["Authorization"] = value.toLowerCase().startsWith("basic ")
            ? value
            : `Basic ${value}`;
        } else {
          headers["Authorization"] = value;
        }
        break;
      default:
        break;
    }
  }
  return headers;
}

/** 스킴 종류를 사람이 읽는 힌트로. */
export function schemeHint(scheme: ParsedSecurityScheme): string {
  const k = scheme.kind;
  switch (k.kind) {
    case "apiKey":
      return `API Key · ${k.location} · ${k.name}`;
    case "http":
      return `HTTP ${k.scheme}`;
    case "oauth2":
      return "OAuth2";
    case "openIdConnect":
      return "OpenID Connect";
    default:
      return "unknown";
  }
}
