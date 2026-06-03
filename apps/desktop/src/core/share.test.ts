import { describe, it, expect } from "vitest";
import {
  isSecretHeader,
  toBase64Url,
  fromBase64Url,
  encodeShare,
  decodeShare,
  SHARE_PREFIX,
  type ShareableRequest,
} from "./share";

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

function sampleReq(over: Partial<ShareableRequest> = {}): ShareableRequest {
  return {
    v: 1,
    method: "POST",
    url: "https://api.example.com/v1/pets?status=sold",
    baseURL: "https://api.example.com/v1",
    pathParams: { petId: "3" },
    queryParams: [{ key: "status", value: "sold", enabled: true }],
    headers: [
      { key: "Content-Type", value: "application/json", enabled: true },
      { key: "Authorization", value: "Bearer SECRET", enabled: true },
      { key: "X-Api-Key", value: "KEY123", enabled: true },
    ],
    body: '{"name":"코코"}',
    bodyMode: "raw",
    note: { text: "6월 제거 예정", status: "deprecated" },
    ...over,
  };
}

describe("encodeShare / decodeShare", () => {
  it("기본은 민감 헤더를 제외하고 왕복 복원한다", async () => {
    const code = await encodeShare(sampleReq());
    expect(code.startsWith(SHARE_PREFIX)).toBe(true);
    const decoded = await decodeShare(code);
    // 일반 헤더만 남음
    expect(decoded.headers.map((h) => h.key)).toEqual(["Content-Type"]);
    // 제외된 민감 헤더 이름 기록
    expect(decoded.excludedSecrets).toEqual(["Authorization", "X-Api-Key"]);
    // 나머지 필드 보존
    expect(decoded.method).toBe("POST");
    expect(decoded.url).toBe("https://api.example.com/v1/pets?status=sold");
    expect(decoded.body).toBe('{"name":"코코"}');
    expect(decoded.pathParams).toEqual({ petId: "3" });
    expect(decoded.note).toEqual({ text: "6월 제거 예정", status: "deprecated" });
  });

  it("includeSecrets:true면 민감 헤더도 포함하고 excludedSecrets는 비운다", async () => {
    const code = await encodeShare(sampleReq(), { includeSecrets: true });
    const decoded = await decodeShare(code);
    expect(decoded.headers.map((h) => h.key)).toEqual(["Content-Type", "Authorization", "X-Api-Key"]);
    expect(decoded.excludedSecrets ?? []).toEqual([]);
  });

  it("한글·이모지가 포함된 body도 정확히 왕복한다", async () => {
    const code = await encodeShare(sampleReq({ body: "안녕 🐶 {\"x\":1}" }));
    expect((await decodeShare(code)).body).toBe("안녕 🐶 {\"x\":1}");
  });

  it("잘못된 접두어는 에러를 던진다", async () => {
    await expect(decodeShare("not-a-share-code")).rejects.toThrow();
  });

  it("깨진 코드는 에러를 던진다", async () => {
    await expect(decodeShare(SHARE_PREFIX + "!!!깨진!!!")).rejects.toThrow();
  });

  it("지원하지 않는 버전은 에러를 던진다", async () => {
    // v:2 를 강제로 인코딩
    const bad = sampleReq();
    (bad as unknown as { v: number }).v = 2;
    const code = await encodeShare(bad, { includeSecrets: true });
    await expect(decodeShare(code)).rejects.toThrow(/버전/);
  });
});
