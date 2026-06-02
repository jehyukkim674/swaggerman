// @vitest-environment jsdom
// mock-config.ts 단위 테스트

import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_MOCK_PORT,
  defaultMockConfig,
  loadMockConfig,
  saveMockConfig,
  buildMockRoutes,
} from "./mock-config";
import type { MockServerConfig } from "./mock-config";
import type { ParsedOperation, ParsedSpec } from "./types";

// ────────────────────────────────────────────────
// 픽스처 헬퍼
// ────────────────────────────────────────────────

function makeOp(overrides: Partial<ParsedOperation> = {}): ParsedOperation {
  return {
    id: "GET /items",
    method: "GET",
    path: "/items",
    tags: [],
    parameters: [],
    responses: [
      { statusCode: "200", schema: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } } } } },
    ],
    ...overrides,
  };
}

function makeSpec(ops: ParsedOperation[]): ParsedSpec {
  return {
    info: { title: "Test API", version: "1.0.0" },
    servers: ["http://localhost:8080"],
    operations: ops,
    securitySchemes: [],
    rawOperationCount: ops.length,
  };
}

beforeEach(() => {
  // 각 테스트 전에 localStorage 초기화
  localStorage.clear();
});

// ────────────────────────────────────────────────
// 테스트 1: 기본 설정 생성
// ────────────────────────────────────────────────

describe("defaultMockConfig", () => {
  it("모든 operation이 enabled, source=schema, port=9090, itemCount=20으로 기본 설정된다", () => {
    const ops = [
      makeOp({ id: "GET /items", method: "GET", path: "/items" }),
      makeOp({
        id: "POST /items",
        method: "POST",
        path: "/items",
        responses: [{ statusCode: "201" }],
      }),
    ];
    const spec = makeSpec(ops);
    const config = defaultMockConfig(spec);

    expect(config.port).toBe(DEFAULT_MOCK_PORT);
    expect(config.port).toBe(9090);
    expect(config.operations).toHaveLength(2);

    for (const opCfg of config.operations) {
      expect(opCfg.enabled).toBe(true);
      expect(opCfg.source).toBe("schema");
      expect(opCfg.delayMs).toBe(0);
      expect(opCfg.itemCount).toBe(20);
      expect(opCfg.seed).toBe(1);
    }
  });

  it("첫 2xx 응답코드를 status로 사용하고, 없으면 200을 기본값으로 쓴다", () => {
    const ops = [
      makeOp({ id: "POST /users", method: "POST", path: "/users", responses: [{ statusCode: "201" }] }),
      makeOp({ id: "DELETE /users/{id}", method: "DELETE", path: "/users/{id}", responses: [] }),
    ];
    const config = defaultMockConfig(makeSpec(ops));

    expect(config.operations.find((o) => o.opId === "POST /users")?.status).toBe(201);
    expect(config.operations.find((o) => o.opId === "DELETE /users/{id}")?.status).toBe(200);
  });
});

// ────────────────────────────────────────────────
// 테스트 2: 저장 후 로드 — 동일 설정 복원
// ────────────────────────────────────────────────

describe("saveMockConfig / loadMockConfig", () => {
  it("저장한 설정을 로드하면 port와 itemCount 변경이 반영된다", () => {
    const spec = makeSpec([makeOp()]);
    const original = defaultMockConfig(spec);
    original.port = 8080;
    original.operations[0].itemCount = 50;
    original.operations[0].seed = 42;

    saveMockConfig("http://localhost/api.json", original);
    const loaded = loadMockConfig("http://localhost/api.json", spec);

    expect(loaded.port).toBe(8080);
    expect(loaded.operations[0].itemCount).toBe(50);
    expect(loaded.operations[0].seed).toBe(42);
  });

  // ────────────────────────────────────────────────
  // 테스트 3: 저장된 설정에 없는 새 operation은 기본값으로 채워짐
  // ────────────────────────────────────────────────

  it("저장된 설정에 없는 새 operation은 기본값으로 채워진다", () => {
    const op1 = makeOp({ id: "GET /items", method: "GET", path: "/items" });
    const spec1 = makeSpec([op1]);
    const config1 = defaultMockConfig(spec1);
    config1.port = 7777;
    saveMockConfig("http://api/spec.json", config1);

    // 스펙에 새 operation 추가
    const op2 = makeOp({
      id: "POST /items",
      method: "POST",
      path: "/items",
      responses: [{ statusCode: "201" }],
    });
    const spec2 = makeSpec([op1, op2]);
    const loaded = loadMockConfig("http://api/spec.json", spec2);

    // 저장된 port 유지
    expect(loaded.port).toBe(7777);
    // 기존 operation은 유지
    const existingOp = loaded.operations.find((o) => o.opId === "GET /items");
    expect(existingOp).toBeDefined();
    // 새 operation은 기본값으로 채워짐
    const newOp = loaded.operations.find((o) => o.opId === "POST /items");
    expect(newOp).toBeDefined();
    expect(newOp?.enabled).toBe(true);
    expect(newOp?.source).toBe("schema");
    expect(newOp?.status).toBe(201);
    expect(newOp?.itemCount).toBe(20);
  });

  it("저장된 port가 없으면 9090을 사용한다", () => {
    const spec = makeSpec([makeOp()]);
    // port 필드 없이 저장
    const partial = { operations: [] } as unknown as MockServerConfig;
    saveMockConfig("http://api/no-port.json", partial);
    const loaded = loadMockConfig("http://api/no-port.json", spec);
    expect(loaded.port).toBe(9090);
  });
});

// ────────────────────────────────────────────────
// 테스트 4: 목록 GET operation → dataset 라우트 변환
// ────────────────────────────────────────────────

describe("buildMockRoutes — 목록 GET", () => {
  it("목록 GET operation은 dataset과 함께 라우트로 변환된다", () => {
    const op = makeOp({
      id: "GET /items",
      method: "GET",
      path: "/items",
      responses: [
        {
          statusCode: "200",
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "integer" }, name: { type: "string" } },
            },
          },
        },
      ],
    });
    const spec = makeSpec([op]);
    const config = defaultMockConfig(spec);
    // 직접 설정한 dataset을 유지하는지 확인
    const customDataset = [{ id: 1, name: "직접 설정" }];
    config.operations[0].dataset = customDataset;

    const routes = buildMockRoutes(spec, config);

    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("GET");
    expect(routes[0].path).toBe("/items");
    expect(routes[0].status).toBe(200);
    expect(routes[0].dataset).toEqual(customDataset);
    expect(routes[0].delayMs).toBe(0);
  });

  it("dataset이 없으면 generateDataset으로 즉석 생성한다", () => {
    const op = makeOp({
      id: "GET /products",
      method: "GET",
      path: "/products",
      responses: [
        {
          statusCode: "200",
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "integer" }, title: { type: "string" } },
            },
          },
        },
      ],
    });
    const spec = makeSpec([op]);
    const config = defaultMockConfig(spec);
    // dataset은 설정하지 않음

    const routes = buildMockRoutes(spec, config);

    expect(routes[0].dataset).toBeDefined();
    expect(Array.isArray(routes[0].dataset)).toBe(true);
    expect((routes[0].dataset as unknown[]).length).toBe(20); // itemCount=20
  });
});

// ────────────────────────────────────────────────
// 테스트 5: 단건 GET (path param) → 부모 dataset 공유 + idField="id"
// ────────────────────────────────────────────────

describe("buildMockRoutes — path param GET", () => {
  it("path param GET은 부모 목록 dataset을 공유하고 idField='id'를 가진다", () => {
    const listOp = makeOp({
      id: "GET /pets",
      method: "GET",
      path: "/pets",
      responses: [
        {
          statusCode: "200",
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "integer" }, name: { type: "string" } },
            },
          },
        },
      ],
    });
    const detailOp = makeOp({
      id: "GET /pets/{petId}",
      method: "GET",
      path: "/pets/{petId}",
      responses: [
        {
          statusCode: "200",
          schema: {
            type: "object",
            properties: { id: { type: "integer" }, name: { type: "string" } },
          },
        },
      ],
    });
    const spec = makeSpec([listOp, detailOp]);
    const config = defaultMockConfig(spec);
    const sharedDataset = [{ id: 1, name: "펫1" }, { id: 2, name: "펫2" }];
    // 목록 operation에 dataset 지정
    config.operations[0].dataset = sharedDataset;

    const routes = buildMockRoutes(spec, config);

    const detailRoute = routes.find((r) => r.path === "/pets/{petId}");
    expect(detailRoute).toBeDefined();
    expect(detailRoute?.idField).toBe("id");
    expect(detailRoute?.dataset).toEqual(sharedDataset);
  });
});

// ────────────────────────────────────────────────
// 테스트 6: POST → 스펙 example을 body로, 상태코드는 응답 정의를 따름
// ────────────────────────────────────────────────

describe("buildMockRoutes — POST/PUT 등", () => {
  it("POST operation은 스펙 example을 body로 사용하고 응답 상태코드(201)를 따른다", () => {
    const exampleBody = { id: 99, name: "생성된 항목" };
    const postOp = makeOp({
      id: "POST /items",
      method: "POST",
      path: "/items",
      responses: [
        {
          statusCode: "201",
          schema: {
            type: "object",
            properties: { id: { type: "integer" }, name: { type: "string" } },
          },
          example: exampleBody,
        },
      ],
    });
    const spec = makeSpec([postOp]);
    const config = defaultMockConfig(spec);

    const routes = buildMockRoutes(spec, config);

    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("POST");
    expect(routes[0].path).toBe("/items");
    expect(routes[0].status).toBe(201);
    expect(routes[0].body).toEqual(exampleBody);
    expect(routes[0].dataset).toBeUndefined();
  });

  it("body가 없고 example도 없으면 스키마로 1건 생성하거나 { ok: true }를 사용한다", () => {
    const deleteOp = makeOp({
      id: "DELETE /items/{id}",
      method: "DELETE",
      path: "/items/{id}",
      responses: [{ statusCode: "204" }],
    });
    const spec = makeSpec([deleteOp]);
    const config = defaultMockConfig(spec);

    const routes = buildMockRoutes(spec, config);

    expect(routes[0].body).toBeDefined();
  });
});

// ────────────────────────────────────────────────
// 테스트 7: enabled=false → 라우트 제외
// ────────────────────────────────────────────────

describe("buildMockRoutes — enabled=false", () => {
  it("enabled=false인 operation은 라우트에서 제외된다", () => {
    const ops = [
      makeOp({ id: "GET /items", method: "GET", path: "/items" }),
      makeOp({ id: "GET /other", method: "GET", path: "/other" }),
    ];
    const spec = makeSpec(ops);
    const config = defaultMockConfig(spec);
    // 두 번째 operation 비활성화
    config.operations[1].enabled = false;

    const routes = buildMockRoutes(spec, config);

    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/items");
  });
});
