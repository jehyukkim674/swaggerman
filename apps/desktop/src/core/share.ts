// 요청을 압축 텍스트로 인코딩해 복사·붙여넣기로 공유한다(서버 없이).
// gzip은 브라우저 내장 CompressionStream 사용(라이브러리 0).

export interface ShareParam {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ShareableRequest {
  v: 1;
  method: string;
  url: string;
  baseURL?: string;
  pathParams: Record<string, string>;
  queryParams: ShareParam[];
  headers: ShareParam[];
  body: string;
  bodyMode?: string;
  note?: { text: string; status: string };
  excludedSecrets?: string[];
}

export const SHARE_PREFIX = "swaggerman:req:";

// 민감 헤더: 정확 일치(authorization/cookie/set-cookie) + 부분 일치 패턴
const SECRET_EXACT = new Set(["authorization", "cookie", "set-cookie"]);
const SECRET_PARTS = ["token", "api-key", "apikey", "secret", "password", "passwd", "auth"];

/** 헤더 key가 토큰/인증 등 민감 정보인지 판별(대소문자 무시). */
export function isSecretHeader(key: string): boolean {
  const k = key.trim().toLowerCase();
  if (SECRET_EXACT.has(k)) return true;
  return SECRET_PARTS.some((p) => k.includes(p));
}

/** Uint8Array → URL-safe base64(패딩 제거). */
export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** URL-safe base64 → Uint8Array. */
export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
