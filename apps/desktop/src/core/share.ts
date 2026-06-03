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

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buf);
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(buf);
}

export interface EncodeOptions {
  includeSecrets?: boolean;
}

/** 요청을 공유 코드 문자열로 인코딩. 기본은 민감 헤더 제외. */
export async function encodeShare(req: ShareableRequest, opts: EncodeOptions = {}): Promise<string> {
  const payload: ShareableRequest = { ...req };
  if (!opts.includeSecrets) {
    const excluded: string[] = [];
    payload.headers = req.headers.filter((h) => {
      if (isSecretHeader(h.key)) {
        excluded.push(h.key);
        return false;
      }
      return true;
    });
    payload.excludedSecrets = excluded;
  } else {
    payload.excludedSecrets = [];
  }
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  const compressed = await gzip(bytes);
  return SHARE_PREFIX + toBase64Url(compressed);
}

/** 공유 코드 문자열을 ShareableRequest로 디코딩. 실패 시 throw. */
export async function decodeShare(code: string): Promise<ShareableRequest> {
  const trimmed = code.trim();
  if (!trimmed.startsWith(SHARE_PREFIX)) {
    throw new Error("공유 코드 형식이 아닙니다 (swaggerman:req: 로 시작해야 함)");
  }
  let parsed: ShareableRequest;
  try {
    const compressed = fromBase64Url(trimmed.slice(SHARE_PREFIX.length));
    const bytes = await gunzip(compressed);
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("공유 코드를 읽을 수 없습니다 (손상되었거나 형식이 잘못됨)");
  }
  if (parsed.v !== 1) {
    throw new Error(`지원하지 않는 공유 코드 버전입니다 (v${parsed.v})`);
  }
  return parsed;
}
