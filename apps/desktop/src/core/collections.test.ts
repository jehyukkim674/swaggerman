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
