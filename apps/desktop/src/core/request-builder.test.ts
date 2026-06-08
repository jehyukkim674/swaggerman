import { describe, it, expect } from "vitest";
import {
  buildRequest,
  buildRequestUrl,
  defaultBody,
  defaultInputs,
  deriveBaseURL,
  pickFileBaseURL,
  restoreInputs,
  captureSample,
  applySample,
  schemaToExample,
} from "./request-builder";
import type { ParsedOperation, ParsedSchema } from "./types";

function op(partial: Partial<ParsedOperation>): ParsedOperation {
  return {
    id: "GET /x",
    method: "GET",
    path: "/x",
    tags: [],
    parameters: [],
    responses: [],
    ...partial,
  };
}

describe("buildRequestUrl", () => {
  const operation = op({
    method: "GET",
    path: "/users/{id}/posts/{postId}",
    parameters: [
      { id: "1", name: "id", location: "path", required: true },
      { id: "2", name: "postId", location: "path", required: true },
      { id: "3", name: "tag", location: "query", required: false },
    ],
  });

  it("path 파라미터 치환 + query 추가", () => {
    const inputs = {
      pathParams: { id: "42", postId: "7" },
      queryParams: [{ key: "tag", value: "news", enabled: true }],
      headers: [],
      body: "",
    };
    const url = buildRequestUrl("https://api.com", operation, inputs);
    expect(url).toBe("https://api.com/users/42/posts/7?tag=news");
  });

  it("비활성/빈 query는 제외", () => {
    const inputs = {
      pathParams: { id: "1", postId: "2" },
      queryParams: [
        { key: "a", value: "", enabled: true },
        { key: "b", value: "x", enabled: false },
      ],
      headers: [],
      body: "",
    };
    expect(buildRequestUrl("https://api.com", operation, inputs)).toBe(
      "https://api.com/users/1/posts/2",
    );
  });

  it("baseURL 끝 슬래시 정리", () => {
    expect(buildRequestUrl("https://api.com/", op({ path: "/a" }), defaultInputs(op({ path: "/a" })))).toBe(
      "https://api.com/a",
    );
  });
});

describe("buildRequest", () => {
  it("활성 헤더만 포함하고 보안 헤더가 우선", () => {
    const operation = op({ method: "POST", path: "/x", requestBody: { required: true, contentType: "application/json" } });
    const inputs = {
      pathParams: {},
      queryParams: [],
      headers: [
        { key: "Accept", value: "application/json", enabled: true },
        { key: "X-Skip", value: "v", enabled: false },
        { key: "Authorization", value: "manual", enabled: true },
      ],
      body: '{"a":1}',
    };
    const req = buildRequest("https://api.com", operation, inputs, { Authorization: "Bearer T" });
    expect(req.headers.Accept).toBe("application/json");
    expect(req.headers["X-Skip"]).toBeUndefined();
    expect(req.headers.Authorization).toBe("Bearer T"); // 보안 헤더가 수동 헤더 덮어씀
    expect(req.body).toBe('{"a":1}');
  });

  it("전역 헤더는 기본값, 요청별/비활성 처리", () => {
    const operation = op({ method: "GET", path: "/x" });
    const inputs = {
      pathParams: {},
      queryParams: [],
      headers: [
        { key: "X-Req", value: "r", enabled: true },
        { key: "X-Common", value: "req", enabled: true },
      ],
      body: "",
    };
    const globalHeaders = [
      { key: "X-Global", value: "g", enabled: true },
      { key: "X-Common", value: "global", enabled: true },
      { key: "X-Off", value: "o", enabled: false },
    ];
    const req = buildRequest("https://api.com", operation, inputs, {}, globalHeaders);
    expect(req.headers["X-Global"]).toBe("g");
    expect(req.headers["X-Req"]).toBe("r");
    expect(req.headers["X-Common"]).toBe("req"); // 요청별이 전역을 덮어씀
    expect(req.headers["X-Off"]).toBeUndefined();
  });

  it("빈 body는 undefined", () => {
    const req = buildRequest("https://api.com", op({ path: "/x" }), {
      pathParams: {},
      queryParams: [],
      headers: [],
      body: "  ",
    });
    expect(req.body).toBeUndefined();
  });

  it("변수({{...}})를 baseURL·헤더·body에서 치환", () => {
    const operation = op({ method: "POST", path: "/x" });
    const inputs = {
      pathParams: {},
      queryParams: [],
      headers: [{ key: "Authorization", value: "Bearer {{token}}", enabled: true }],
      body: '{"id":"{{uid}}"}',
    };
    const vars = { base: "https://prod.api", token: "T123", uid: "5" };
    const req = buildRequest("{{base}}", operation, inputs, {}, [], vars);
    expect(req.url).toBe("https://prod.api/x");
    expect(req.headers.Authorization).toBe("Bearer T123");
    expect(req.body).toBe('{"id":"5"}');
  });

  it("미정의 변수는 원문을 유지", () => {
    const req = buildRequest(
      "https://api.com",
      op({ method: "GET", path: "/x" }),
      { pathParams: {}, queryParams: [], headers: [{ key: "X-T", value: "{{nope}}", enabled: true }], body: "" },
      {},
      [],
      {},
    );
    expect(req.headers["X-T"]).toBe("{{nope}}");
  });
});

describe("defaultInputs 파라미터 prefill", () => {
  it("query/path를 스펙 example·default·enum로 채운다", () => {
    const operation = op({
      method: "GET",
      path: "/items/{id}",
      parameters: [
        { id: "1", name: "id", location: "path", required: true, schema: { type: "string", example: "42" } },
        { id: "2", name: "page", location: "query", required: false, schema: { type: "integer", defaultValue: "1" } },
        {
          id: "3",
          name: "sort",
          location: "query",
          required: false,
          schema: { type: "string", enumValues: ["asc", "desc"] },
        },
        { id: "4", name: "q", location: "query", required: false, schema: { type: "string" } },
      ],
    });
    const inputs = defaultInputs(operation);
    expect(inputs.pathParams.id).toBe("42");
    expect(inputs.queryParams.find((p) => p.key === "page")?.value).toBe("1");
    expect(inputs.queryParams.find((p) => p.key === "sort")?.value).toBe("asc");
    expect(inputs.queryParams.find((p) => p.key === "q")?.value).toBe(""); // 값 없으면 빈값
  });
});

describe("buildRequest body 모드", () => {
  const postOp = op({ method: "POST", path: "/x" });
  const base = (over: Partial<import("./request-builder").RequestInputs>) => ({
    pathParams: {},
    queryParams: [],
    headers: [],
    body: "",
    ...over,
  });

  it("urlencoded: 활성 form 파트만 + 변수 치환, body 미전송", () => {
    const req = buildRequest(
      "https://api.com",
      postOp,
      base({
        bodyMode: "urlencoded",
        body: "ignored",
        form: [
          { name: "a", value: "{{v}}", enabled: true },
          { name: "off", value: "x", enabled: false },
          { name: "", value: "noname", enabled: true },
        ],
      }),
      {},
      [],
      { v: "1" },
    );
    expect(req.multipart).toBe(false);
    expect(req.form).toEqual([{ name: "a", value: "1", filePath: undefined, contentType: undefined }]);
    expect(req.body).toBeUndefined();
  });

  it("multipart: 파일 경로/Content-Type 전달, multipart=true", () => {
    const req = buildRequest(
      "https://api.com",
      postOp,
      base({
        bodyMode: "multipart",
        form: [{ name: "file", value: "", filePath: "/tmp/a.png", contentType: "image/png", enabled: true }],
      }),
    );
    expect(req.multipart).toBe(true);
    expect(req.form).toEqual([
      { name: "file", value: "", filePath: "/tmp/a.png", contentType: "image/png" },
    ]);
  });

  it("none: body를 전송하지 않음", () => {
    const req = buildRequest("https://api.com", postOp, base({ bodyMode: "none", body: "{}" }));
    expect(req.body).toBeUndefined();
    expect(req.form).toBeUndefined();
  });

  it("raw(기본): 기존처럼 body 전송", () => {
    const req = buildRequest("https://api.com", postOp, base({ bodyMode: "raw", body: '{"a":1}' }));
    expect(req.body).toBe('{"a":1}');
    expect(req.form).toBeUndefined();
  });
});

describe("buildRequestUrl 변수 치환", () => {
  it("path/query 값의 변수를 치환", () => {
    const operation = op({
      method: "GET",
      path: "/users/{id}",
      parameters: [
        { id: "1", name: "id", location: "path", required: true },
        { id: "2", name: "q", location: "query", required: false },
      ],
    });
    const inputs = {
      pathParams: { id: "{{uid}}" },
      queryParams: [{ key: "q", value: "{{kw}}", enabled: true }],
      headers: [],
      body: "",
    };
    const url = buildRequestUrl("https://api.com", operation, inputs, true, { uid: "9", kw: "hi" });
    expect(url).toBe("https://api.com/users/9?q=hi");
  });
});

describe("schemaToExample", () => {
  it("객체/배열/원시 타입 예시 생성", () => {
    const schema: ParsedSchema = {
      type: "object",
      properties: {
        id: { type: "integer" },
        name: { type: "string" },
        active: { type: "boolean" },
        tags: { type: "array", items: { type: "string" } },
        role: { type: "string", enumValues: ["admin", "user"] },
      },
    };
    expect(schemaToExample(schema)).toEqual({
      id: 0,
      name: "",
      active: false,
      tags: [""],
      role: "admin",
    });
  });

  it("example/default 값 우선", () => {
    expect(schemaToExample({ type: "integer", example: "42" })).toBe(42);
    expect(schemaToExample({ type: "string", defaultValue: "hi" })).toBe("hi");
  });
});

describe("defaultBody", () => {
  it("스펙 example 우선", () => {
    const operation = op({
      requestBody: { required: true, contentType: "application/json", example: { x: 1 } },
    });
    expect(defaultBody(operation)).toBe(JSON.stringify({ x: 1 }, null, 2));
  });

  it("example 없으면 스키마로 생성", () => {
    const operation = op({
      requestBody: {
        required: true,
        contentType: "application/json",
        schema: { type: "object", properties: { a: { type: "integer" } } },
      },
    });
    expect(defaultBody(operation)).toBe(JSON.stringify({ a: 0 }, null, 2));
  });

  it("requestBody 없으면 빈 문자열", () => {
    expect(defaultBody(op({}))).toBe("");
  });
});

describe("deriveBaseURL", () => {
  it("서버 절대 URL 우선", () => {
    expect(deriveBaseURL("http://x/v3/api-docs", ["https://api.com"])).toBe("https://api.com");
  });
  it("서버 없으면 spec origin", () => {
    expect(deriveBaseURL("http://localhost:8000/v3/api-docs", [])).toBe("http://localhost:8000");
  });
});

describe("restoreInputs (마지막 요청 정보 복원)", () => {
  const operation = op({
    id: "GET /volumes",
    path: "/volumes",
    parameters: [
      { id: "1", name: "targetIp", location: "query", required: true },
      { id: "2", name: "type", location: "query", required: false },
    ],
  });

  it("저장된 입력값이 있으면 그대로 복원한다", () => {
    const saved = {
      "GET /volumes": {
        pathParams: {},
        queryParams: [
          { key: "targetIp", value: "{{targetIp}}", enabled: true },
          { key: "sslVerify", value: "true", enabled: true },
        ],
        headers: [{ key: "Accept", value: "application/json", enabled: true }],
        body: "",
      },
    };
    const restored = restoreInputs(saved, operation);
    expect(restored).toEqual(saved["GET /volumes"]);
    // 사용자가 추가한 행(sslVerify)도 보존
    expect(restored.queryParams.find((q) => q.key === "sslVerify")?.value).toBe("true");
  });

  it("저장된 값이 없으면 스펙 기본값을 반환한다", () => {
    const restored = restoreInputs({}, operation);
    expect(restored).toEqual(defaultInputs(operation));
    expect(restored.queryParams.map((q) => q.key)).toEqual(["targetIp", "type"]);
  });

  it("다른 오퍼레이션의 저장값에는 영향받지 않는다", () => {
    const saved = {
      "GET /other": {
        pathParams: {},
        queryParams: [{ key: "x", value: "1", enabled: true }],
        headers: [],
        body: "",
      },
    };
    const restored = restoreInputs(saved, operation);
    expect(restored).toEqual(defaultInputs(operation));
  });
});

describe("요청 샘플 (captureSample / applySample)", () => {
  const operation = op({
    id: "GET /offerings",
    parameters: [{ id: "1", name: "targetIp", location: "query", required: true }],
  });

  it("captureSample은 query/headers/body를 모두 캡처한다", () => {
    const inputs = defaultInputs(operation);
    inputs.queryParams = [{ key: "targetIp", value: "10.0.0.1", enabled: true }];
    inputs.headers = [{ key: "X-Token", value: "abc", enabled: true }];
    inputs.body = '{"a":1}';
    const sample = captureSample("개발기 세트", inputs);
    expect(sample.name).toBe("개발기 세트");
    expect(sample.queryParams).toEqual(inputs.queryParams);
    expect(sample.headers).toEqual(inputs.headers);
    expect(sample.body).toBe('{"a":1}');
  });

  it("applySample은 저장된 query/headers/body를 폼에 적용한다", () => {
    const inputs = defaultInputs(operation);
    const sample = {
      name: "s",
      body: '{"b":2}',
      queryParams: [{ key: "targetIp", value: "10.9.9.9", enabled: true }],
      headers: [{ key: "X-Env", value: "dev", enabled: true }],
    };
    const applied = applySample(inputs, sample);
    expect(applied.body).toBe('{"b":2}');
    expect(applied.queryParams).toEqual(sample.queryParams);
    expect(applied.headers).toEqual(sample.headers);
    // 적용해도 pathParams 등 다른 필드는 유지
    expect(applied.pathParams).toEqual(inputs.pathParams);
  });

  it("옛 샘플(body만 저장)은 query/headers를 건드리지 않는다(하위 호환)", () => {
    const inputs = defaultInputs(operation);
    const legacy = { name: "old", body: '{"old":true}' };
    const applied = applySample(inputs, legacy);
    expect(applied.body).toBe('{"old":true}');
    expect(applied.queryParams).toEqual(inputs.queryParams);
    expect(applied.headers).toEqual(inputs.headers);
  });
});

describe("pickFileBaseURL", () => {
  it("servers 중 첫 절대(http/https) URL을 반환", () => {
    expect(pickFileBaseURL(["/v1", "https://api.x.com"])).toBe("https://api.x.com");
    expect(pickFileBaseURL(["http://a.com", "https://b.com"])).toBe("http://a.com");
  });
  it("절대 서버가 없으면 빈 문자열", () => {
    expect(pickFileBaseURL([])).toBe("");
    expect(pickFileBaseURL(["/rel", "{var}/api"])).toBe("");
  });
});
