import { describe, it, expect } from "vitest";
import {
  parsePostmanV21,
  exportCollections,
  importCollections,
  type Collection,
} from "./collections";

const postman = {
  info: { name: "My API", schema: "https://schema.getpostman.com/json/collection/v2.1.0/" },
  item: [
    {
      name: "auth",
      item: [
        {
          name: "login",
          request: {
            method: "post",
            header: [{ key: "Content-Type", value: "application/json" }],
            url: { raw: "https://api.com/login" },
            body: { mode: "raw", raw: '{"id":"a"}' },
          },
        },
      ],
    },
    {
      name: "list users",
      request: {
        method: "GET",
        header: [],
        url: { protocol: "https", host: ["api", "com"], path: ["users"] },
      },
    },
  ],
};

describe("parsePostmanV21", () => {
  it("폴더 경로로 평탄화하고 요청을 추출한다", () => {
    const c = parsePostmanV21(postman);
    expect(c.name).toBe("My API");
    expect(c.requests).toHaveLength(2);

    const login = c.requests.find((r) => r.name === "login")!;
    expect(login.method).toBe("POST");
    expect(login.url).toBe("https://api.com/login");
    expect(login.folder).toBe("auth");
    expect(login.headers).toContainEqual({ key: "Content-Type", value: "application/json" });
    expect(login.body).toBe('{"id":"a"}');

    const list = c.requests.find((r) => r.name === "list users")!;
    expect(list.method).toBe("GET");
    expect(list.url).toBe("https://api.com/users");
    expect(list.folder).toBeUndefined();
  });

  it("형식이 아니면 에러", () => {
    expect(() => parsePostmanV21({ foo: 1 })).toThrow("Postman");
  });
});

describe("export/import 라운드트립", () => {
  const collections: Collection[] = [
    {
      id: "c1",
      name: "내 컬렉션",
      requests: [
        { id: "r1", name: "ping", method: "GET", url: "https://x/ping", headers: [], body: "" },
      ],
    },
  ];

  it("export→import 동일 복원", () => {
    const text = exportCollections(collections);
    expect(importCollections(text)).toEqual(collections);
  });

  it("Postman JSON을 import하면 컬렉션 배열로", () => {
    const result = importCollections(JSON.stringify(postman));
    expect(result).toHaveLength(1);
    expect(result[0].requests).toHaveLength(2);
  });
});

describe("savedToRequest", () => {
  it("절대 URL을 baseURL/path/query로 분해한다", async () => {
    const { savedToRequest } = await import("./collections");
    const { operation, inputs, baseURL } = savedToRequest({
      id: "s1", name: "조회", method: "GET",
      url: "https://api.x.com/users?page=2&q=kim",
      headers: [{ key: "Accept", value: "application/json" }], body: "",
    });
    expect(baseURL).toBe("https://api.x.com");
    expect(operation.path).toBe("/users");
    expect(inputs.queryParams).toEqual([
      { key: "page", value: "2", enabled: true },
      { key: "q", value: "kim", enabled: true },
    ]);
    expect(inputs.headers[0]).toEqual({ key: "Accept", value: "application/json", enabled: true });
    expect(inputs.bodyMode).toBe("none");
  });

  it("body가 있으면 raw 모드 + requestBody 설정", async () => {
    const { savedToRequest } = await import("./collections");
    const { operation, inputs } = savedToRequest({
      id: "s2", name: "생성", method: "POST", url: "https://api.x.com/users",
      headers: [], body: '{"name":"kim"}',
    });
    expect(operation.requestBody).toBeTruthy();
    expect(inputs.bodyMode).toBe("raw");
  });

  it("상대 URL은 그대로 path로 두고 baseURL은 빈 문자열", async () => {
    const { savedToRequest } = await import("./collections");
    const { baseURL, operation } = savedToRequest({
      id: "s3", name: "rel", method: "GET", url: "/v3/api-docs", headers: [], body: "",
    });
    expect(baseURL).toBe("");
    expect(operation.path).toBe("/v3/api-docs");
  });
});

describe("requestToSaved", () => {
  it("활성+키가 있는 헤더만 저장하고 id를 부여한다", async () => {
    const { requestToSaved } = await import("./collections");
    const saved = requestToSaved("내 요청", "POST", "https://x/users", [
      { key: "A", value: "1", enabled: true },
      { key: "", value: "2", enabled: true },
      { key: "B", value: "3", enabled: false },
    ], '{"a":1}');
    expect(saved.id).toBeTruthy();
    expect(saved.name).toBe("내 요청");
    expect(saved.headers).toEqual([{ key: "A", value: "1" }]);
    expect(saved.body).toBe('{"a":1}');
  });
});
