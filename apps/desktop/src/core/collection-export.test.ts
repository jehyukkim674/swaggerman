import { describe, it, expect } from "vitest";
import yaml from "js-yaml";
import {
  toPostmanV21,
  toCurlScript,
  toOpenAPI,
  toBruFiles,
} from "./collection-export";
import { parsePostmanV21, type Collection, type SavedRequest } from "./collections";

function req(over: Partial<SavedRequest>): SavedRequest {
  return {
    id: "r1",
    name: "요청",
    method: "GET",
    url: "https://api.test/users",
    headers: [],
    body: "",
    ...over,
  };
}

const col = (name: string, requests: SavedRequest[]): Collection => ({ id: name, name, requests });

const sample: Collection[] = [
  col("Users API", [
    req({ name: "목록", method: "GET", url: "https://api.test/users" }),
    req({
      name: "생성",
      method: "POST",
      url: "https://api.test/users",
      headers: [{ key: "X-Token", value: "abc" }],
      body: '{"name":"kim"}',
      folder: "쓰기/관리자",
    }),
  ]),
];

describe("toPostmanV21", () => {
  it("단일 컬렉션 round-trip(이름·메서드·URL·헤더·body·폴더 복원)", () => {
    const json = toPostmanV21(sample);
    const back = parsePostmanV21(JSON.parse(json));
    expect(back.name).toBe("Users API");
    expect(back.requests).toHaveLength(2);
    const create = back.requests.find((r) => r.name === "생성")!;
    expect(create.method).toBe("POST");
    expect(create.url).toBe("https://api.test/users");
    expect(create.headers).toEqual([{ key: "X-Token", value: "abc" }]);
    expect(create.body).toBe('{"name":"kim"}');
    expect(create.folder).toBe("쓰기/관리자");
  });

  it("여러 컬렉션은 각각 최상위 폴더로 묶인다", () => {
    const multi = [col("A", [req({ name: "a1" })]), col("B", [req({ name: "b1" })])];
    const doc = JSON.parse(toPostmanV21(multi));
    expect(doc.item.map((i: { name: string }) => i.name)).toEqual(["A", "B"]);
    const back = parsePostmanV21(doc);
    // A/B가 폴더가 되어 folder 경로에 반영
    expect(back.requests.map((r) => r.folder)).toEqual(["A", "B"]);
  });

  it("유효한 Postman 스키마 URL을 포함", () => {
    expect(JSON.parse(toPostmanV21(sample)).info.schema).toContain("v2.1.0");
  });
});

describe("toCurlScript", () => {
  const sh = toCurlScript(sample);
  it("bash shebang으로 시작", () => expect(sh.startsWith("#!/usr/bin/env bash")).toBe(true));
  it("요청마다 컬렉션/폴더/이름 주석", () => {
    expect(sh).toContain("# Users API/목록");
    expect(sh).toContain("# Users API/쓰기/관리자/생성");
  });
  it("curl 명령과 헤더·body 포함", () => {
    expect(sh).toContain("curl -X POST 'https://api.test/users'");
    expect(sh).toContain("-H 'X-Token: abc'");
    expect(sh).toContain(`-d '{"name":"kim"}'`);
  });
});

interface OAOperation {
  summary?: string;
  parameters?: { name: string; in: string; example?: unknown }[];
  requestBody?: { content: Record<string, { example: unknown }> };
}
interface OADoc {
  openapi: string;
  servers?: { url: string }[];
  paths: Record<string, Record<string, OAOperation>>;
}

describe("toOpenAPI", () => {
  const doc = yaml.load(toOpenAPI(sample)) as OADoc;
  it("openapi 3.1 + servers에 origin", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers).toEqual([{ url: "https://api.test" }]);
  });
  it("path별 method 그룹핑", () => {
    expect(Object.keys(doc.paths)).toEqual(["/users"]);
    expect(Object.keys(doc.paths["/users"])).toEqual(expect.arrayContaining(["get", "post"]));
  });
  it("body는 JSON example로, 헤더는 parameter로", () => {
    const post = doc.paths["/users"].post;
    expect(post.requestBody!.content["application/json"].example).toEqual({ name: "kim" });
    expect(post.parameters![0]).toMatchObject({ name: "X-Token", in: "header" });
  });
  it("비 JSON body는 문자열 example", () => {
    const out = yaml.load(
      toOpenAPI([col("c", [req({ method: "POST", url: "https://x/y", body: "plain" })])]),
    ) as OADoc;
    expect(out.paths["/y"].post.requestBody!.content["application/json"].example).toBe("plain");
  });
});

describe("toBruFiles", () => {
  const files = toBruFiles(sample);
  it("요청당 .bru 파일 + 컬렉션/폴더 경로", () => {
    expect(files.map((f) => f.relPath)).toEqual([
      "Users_API/목록.bru",
      "Users_API/쓰기/관리자/생성.bru",
    ]);
  });
  it(".bru 본문에 meta·method·headers·body 블록", () => {
    const create = files.find((f) => f.relPath.endsWith("생성.bru"))!.content;
    expect(create).toContain("meta {");
    expect(create).toContain("name: 생성");
    expect(create).toContain("post {");
    expect(create).toContain("url: https://api.test/users");
    expect(create).toContain("body: json");
    expect(create).toContain("X-Token: abc");
    expect(create).toContain("body:json {");
  });
  it("body 없으면 body:none + body 블록 생략", () => {
    const list = files.find((f) => f.relPath.endsWith("목록.bru"))!.content;
    expect(list).toContain("body: none");
    expect(list).not.toContain("body:json {");
  });
  it("seq는 컬렉션 내에서 1부터 증가", () => {
    expect(files[0].content).toContain("seq: 1");
    expect(files[1].content).toContain("seq: 2");
  });
});
