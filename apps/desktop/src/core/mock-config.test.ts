// @vitest-environment jsdom
// mock-config.ts 단위 테스트

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  DEFAULT_MOCK_PORT,
  defaultMockConfig,
  loadMockConfig,
  buildMockRoutes,
  applyPresetToConfig,
} from "./mock-config";
import type { MockServerConfig, MockPreset, MockRequestEntry } from "./mock-config";
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

// 레거시 localStorage 읽기 경로 — 저장은 IndexedDB(loadMockConfigAsync 마이그레이션 소스)
describe("loadMockConfig (레거시 localStorage 읽기)", () => {
  /** 레거시 포맷 그대로 localStorage에 기록 (구버전 saveMockConfig가 하던 일) */
  const writeLegacy = (specUrl: string, config: unknown) =>
    localStorage.setItem(`swaggerman.mock.${specUrl}`, JSON.stringify(config));

  it("저장한 설정을 로드하면 port와 itemCount 변경이 반영된다", () => {
    const spec = makeSpec([makeOp()]);
    const original = defaultMockConfig(spec);
    original.port = 8080;
    original.operations[0].itemCount = 50;
    original.operations[0].seed = 42;

    writeLegacy("http://localhost/api.json", original);
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
    writeLegacy("http://api/spec.json", config1);

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
    writeLegacy("http://api/no-port.json", partial);
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
// 테스트 5: 단건 GET (path param) → 부모 dataset 공유 + idField 추론
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

  it("아이템에 path param 이름(petId)과 같은 키가 있으면 idField로 사용한다", () => {
    // 목록 op의 dataset 아이템이 { petId: 1, name: "..." } 형태
    // → 단건 라우트의 idField가 "petId"
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
              properties: { petId: { type: "integer" }, name: { type: "string" } },
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
            properties: { petId: { type: "integer" }, name: { type: "string" } },
          },
        },
      ],
    });
    const spec = makeSpec([listOp, detailOp]);
    const config = defaultMockConfig(spec);
    // 아이템 키가 petId인 dataset 설정
    const sharedDataset = [{ petId: 1, name: "펫1" }, { petId: 2, name: "펫2" }];
    config.operations[0].dataset = sharedDataset;

    const routes = buildMockRoutes(spec, config);

    const detailRoute = routes.find((r) => r.path === "/pets/{petId}");
    expect(detailRoute).toBeDefined();
    expect(detailRoute?.idField).toBe("petId");
    expect(detailRoute?.dataset).toEqual(sharedDataset);
  });

  it("path param 이름과 일치하는 키가 없고 id 키가 있으면 idField는 id", () => {
    // 아이템이 { id: 1, name: "..." } 인데 path param은 {petId}
    // → idField "id"
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
    // 아이템 키가 "id"이고, path param은 "petId" (불일치)
    const sharedDataset = [{ id: 1, name: "펫1" }];
    config.operations[0].dataset = sharedDataset;

    const routes = buildMockRoutes(spec, config);

    const detailRoute = routes.find((r) => r.path === "/pets/{petId}");
    expect(detailRoute).toBeDefined();
    expect(detailRoute?.idField).toBe("id");
  });

  it("id도 없으면 'id'로 끝나는 첫 키를 idField로 사용한다", () => {
    // 아이템이 { appId: "A-1", name: "..." }, path param은 {code}
    // → idField "appId"
    const listOp = makeOp({
      id: "GET /apps",
      method: "GET",
      path: "/apps",
      responses: [
        {
          statusCode: "200",
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: { appId: { type: "string" }, name: { type: "string" } },
            },
          },
        },
      ],
    });
    const detailOp = makeOp({
      id: "GET /apps/{code}",
      method: "GET",
      path: "/apps/{code}",
      responses: [
        {
          statusCode: "200",
          schema: {
            type: "object",
            properties: { appId: { type: "string" }, name: { type: "string" } },
          },
        },
      ],
    });
    const spec = makeSpec([listOp, detailOp]);
    const config = defaultMockConfig(spec);
    // appId 키만 있고, "id" 키도 없으며 path param("code")과도 불일치
    const sharedDataset = [{ appId: "A-1", name: "앱1" }];
    config.operations[0].dataset = sharedDataset;

    const routes = buildMockRoutes(spec, config);

    const detailRoute = routes.find((r) => r.path === "/apps/{code}");
    expect(detailRoute).toBeDefined();
    expect(detailRoute?.idField).toBe("appId");
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

// ────────────────────────────────────────────────
// 테스트 8: Mock 프리셋 CRUD + applyPresetToConfig
// ────────────────────────────────────────────────

describe("requests 필드(요청 엔트리)", () => {
  beforeEach(() => localStorage.clear());
  const url = "https://api.test/spec.json";

  it("defaultMockConfig는 requests를 빈 배열로 둔다", () => {
    const spec = makeSpec([makeOp({ id: "GET /x" })]);
    expect(defaultMockConfig(spec).requests).toEqual([]);
  });

  it("loadMockConfig가 레거시 저장본의 requests를 보존한다", () => {
    const spec = makeSpec([makeOp({ id: "GET /x" })]);
    const cfg = defaultMockConfig(spec);
    cfg.requests = [
      { id: "r1", method: "GET", path: "/api/v1/code/IP_STATUS", status: 200, body: { ok: true }, delayMs: 0 },
    ] as MockRequestEntry[];
    localStorage.setItem(`swaggerman.mock.${url}`, JSON.stringify(cfg));
    const loaded = loadMockConfig(url, spec);
    expect(loaded.requests).toHaveLength(1);
    expect(loaded.requests![0].path).toBe("/api/v1/code/IP_STATUS");
  });
});

describe("applyPresetToConfig", () => {
  // 프리셋 CRUD(load/save/delete/rename)는 IndexedDB 저장소(mock-presets-store.test.ts)에서 테스트.

  it("config에 있는 opId만 프리셋 값으로 교체하고 port·미존재는 유지한다", () => {
    const spec = makeSpec([makeOp({ id: "GET /items" }), makeOp({ id: "GET /pets", path: "/pets" })]);
    const config: MockServerConfig = { port: 9099, operations: defaultMockConfig(spec).operations, requests: [] };
    const preset: MockPreset = {
      id: "p1",
      title: "p",
      savedAt: 1,
      operations: [
        { opId: "GET /items", enabled: false, source: "manual", status: 404, delayMs: 5, itemCount: 3, seed: 2, body: { x: 1 } },
        { opId: "GET /gone", enabled: true, source: "manual", status: 200, delayMs: 0, itemCount: 20, seed: 1 }, // 스펙에 없음 → 무시
      ],
    };
    const out = applyPresetToConfig(config, preset);
    expect(out.port).toBe(9099); // port 유지
    const items = out.operations.find((o) => o.opId === "GET /items")!;
    expect(items.status).toBe(404); // 프리셋 값 반영
    expect(items.body).toEqual({ x: 1 });
    const pets = out.operations.find((o) => o.opId === "GET /pets")!;
    expect(pets.enabled).toBe(true); // 프리셋에 없으니 config 기존값 유지
    expect(out.operations.some((o) => o.opId === "GET /gone")).toBe(false); // 미존재 opId 무시
    expect(config.operations.find((o) => o.opId === "GET /items")!.status).toBe(200); // 원본 불변
  });
});

// ────────────────────────────────────────────────
// 테스트: 비동기 IndexedDB 설정 저장/로드 (활성 설정 — 대용량 캡처 대응)
// ────────────────────────────────────────────────

describe("loadMockConfigAsync / saveMockConfigAsync (IndexedDB)", () => {
  const url = "https://api.test/openapi.json";
  // mock-config-store의 dbPromise가 모듈에 캐시되므로 매 테스트 격리
  let mod: typeof import("./mock-config");
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    vi.resetModules();
    mod = await import("./mock-config");
  });

  it("저장된 게 없으면 기본 설정을 반환한다", async () => {
    const spec = makeSpec([makeOp()]);
    const loaded = await mod.loadMockConfigAsync(url, spec);
    expect(loaded).toEqual(mod.defaultMockConfig(spec));
  });

  it("saveAsync→loadAsync 라운드트립으로 requests·port가 보존된다", async () => {
    const spec = makeSpec([makeOp()]);
    const cfg = mod.defaultMockConfig(spec);
    cfg.port = 8123;
    cfg.requests = [
      { id: "r1", method: "GET", path: "/api/v1/code/IP_STATUS", status: 200, body: { ok: true }, delayMs: 0 },
    ];
    expect(await mod.saveMockConfigAsync(url, cfg)).toBe(true);
    const loaded = await mod.loadMockConfigAsync(url, spec);
    expect(loaded.port).toBe(8123);
    expect(loaded.requests).toHaveLength(1);
    expect(loaded.requests[0].path).toBe("/api/v1/code/IP_STATUS");
  });

  it("레거시 localStorage 설정을 IndexedDB로 마이그레이션하고 키를 제거한다", async () => {
    const spec = makeSpec([makeOp()]);
    const legacy = mod.defaultMockConfig(spec);
    legacy.port = 7070;
    localStorage.setItem(`swaggerman.mock.${url}`, JSON.stringify(legacy));

    const loaded = await mod.loadMockConfigAsync(url, spec);
    expect(loaded.port).toBe(7070);
    // localStorage에서 제거되고 IndexedDB로 옮겨짐
    expect(localStorage.getItem(`swaggerman.mock.${url}`)).toBeNull();
    expect((await mod.loadMockConfigAsync(url, spec)).port).toBe(7070);
  });

  it("저장본에 없는 새 operation은 기본값으로 채워진다", async () => {
    const op1 = makeOp({ id: "GET /items" });
    const spec1 = makeSpec([op1]);
    const cfg = mod.defaultMockConfig(spec1);
    cfg.operations[0].itemCount = 77;
    await mod.saveMockConfigAsync(url, cfg);

    const op2 = makeOp({ id: "POST /items", method: "POST", responses: [{ statusCode: "201" }] });
    const loaded = await mod.loadMockConfigAsync(url, makeSpec([op1, op2]));
    expect(loaded.operations.find((o) => o.opId === "GET /items")?.itemCount).toBe(77);
    const added = loaded.operations.find((o) => o.opId === "POST /items");
    expect(added?.status).toBe(201);
    expect(added?.itemCount).toBe(20);
  });
});

// ────────────────────────────────────────────────
// 테스트: 명시 body 우선 서빙 (히스토리/직접 편집으로 넣은 래퍼 객체 등)
// ────────────────────────────────────────────────

describe("buildMockRoutes — 명시 body 우선", () => {
  it("목록 GET에 dataset 없이 body(래퍼 객체)만 있으면 body 라우트로 서빙한다", () => {
    const op = makeOp({ id: "GET /items", method: "GET", path: "/items" });
    const spec = makeSpec([op]);
    const config = defaultMockConfig(spec);
    // 히스토리에서 가져온 페이지네이션 래퍼 응답(객체)
    config.operations[0].body = { content: [{ id: 1 }], totalElements: 1 };
    config.operations[0].dataset = undefined;

    const routes = buildMockRoutes(spec, config);

    expect(routes).toHaveLength(1);
    expect(routes[0].body).toEqual({ content: [{ id: 1 }], totalElements: 1 });
    expect(routes[0].dataset).toBeUndefined(); // 자동 생성으로 가려지면 안 됨
  });

  it("단건 GET에 dataset 없이 body만 있으면 부모 dataset 공유 대신 body 라우트로 서빙한다", () => {
    const listOp = makeOp({ id: "GET /pets", method: "GET", path: "/pets" });
    const oneOp = makeOp({
      id: "GET /pets/{id}", method: "GET", path: "/pets/{id}",
      responses: [{ statusCode: "200", schema: { type: "object", properties: { id: { type: "integer" } } } }],
    });
    const spec = makeSpec([listOp, oneOp]);
    const config = defaultMockConfig(spec);
    const oneCfg = config.operations.find((o) => o.opId === "GET /pets/{id}")!;
    oneCfg.body = { id: 7, name: "히스토리응답" };
    oneCfg.dataset = undefined;

    const routes = buildMockRoutes(spec, config);
    const oneRoute = routes.find((r) => r.path === "/pets/{id}")!;

    expect(oneRoute.body).toEqual({ id: 7, name: "히스토리응답" });
    expect(oneRoute.dataset).toBeUndefined();
    expect(oneRoute.idField).toBeUndefined(); // 단건 조회 매칭 없이 그대로 응답
  });
});
