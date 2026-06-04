import { describe, it, expect } from "vitest";
import { parseCurl, tokenizeCurl } from "./curl";

describe("tokenizeCurl", () => {
  it("따옴표와 백슬래시 줄바꿈을 처리한다", () => {
    const t = tokenizeCurl("curl 'http://a/b' \\\n -H \"X: y\"");
    expect(t).toEqual(["curl", "http://a/b", "-H", "X: y"]);
  });
});

describe("parseCurl", () => {
  it("기본 GET", () => {
    const r = parseCurl("curl https://api.com/users");
    expect(r.method).toBe("GET");
    expect(r.url).toBe("https://api.com/users");
  });

  it("-X, -H, -d (데이터 있으면 기본 POST)", () => {
    const r = parseCurl(
      `curl -X POST https://api.com/u -H "Content-Type: application/json" -d '{"a":1}'`,
    );
    expect(r.method).toBe("POST");
    expect(r.url).toBe("https://api.com/u");
    expect(r.headers).toContainEqual({ key: "Content-Type", value: "application/json" });
    expect(r.body).toBe('{"a":1}');
  });

  it("-d만 있어도 POST로 추론", () => {
    const r = parseCurl(`curl https://api.com -d 'x=1'`);
    expect(r.method).toBe("POST");
    expect(r.body).toBe("x=1");
  });

  it("--data 여러 개는 & 로 결합", () => {
    const r = parseCurl(`curl https://api.com --data a=1 --data b=2`);
    expect(r.body).toBe("a=1&b=2");
  });

  it("-u 는 Basic 인증 헤더로", () => {
    const r = parseCurl(`curl https://api.com -u user:pass`);
    expect(r.headers).toContainEqual({ key: "Authorization", value: `Basic ${btoa("user:pass")}` });
  });

  it("--url 과 무인자 플래그(-L,-k) 처리", () => {
    const r = parseCurl(`curl -L -k --url https://api.com/x`);
    expect(r.url).toBe("https://api.com/x");
  });

  it("curl 아니면 에러", () => {
    expect(() => parseCurl("wget http://a")).toThrow();
  });

  it("URL 없으면 에러", () => {
    expect(() => parseCurl("curl -X GET")).toThrow("URL");
  });
});

describe("parseCurl 추가 케이스", () => {
  it("큰따옴표와 이스케이프(\\\")를 처리한다", () => {
    const r = parseCurl('curl -X POST https://x/api -d "{\\"a\\":\\"b\\"}"');
    expect(r.body).toBe('{"a":"b"}');
  });

  it("-G(--get)는 데이터가 있어도 메서드를 GET으로", () => {
    const r = parseCurl("curl -G https://x/api -d q=1");
    expect(r.method).toBe("GET");
  });

  it("curlToRequest는 operation/inputs/baseURL을 만든다", async () => {
    const { curlToRequest } = await import("./curl");
    const { operation, inputs, baseURL } = curlToRequest(
      'curl -X POST https://api.x.com/users?p=1 -H "Accept: application/json" -d \'{"n":1}\'',
    );
    expect(operation.method).toBe("POST");
    expect(baseURL).toContain("api.x.com");
    expect(inputs.body).toBe('{"n":1}');
  });
});
