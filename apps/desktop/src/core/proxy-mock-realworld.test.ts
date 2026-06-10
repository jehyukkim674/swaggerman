// @vitest-environment jsdom
// 실세계 형태(FastAPI 3.1, servers=호스트만, 경로는 /api/v1/... 전체경로, 목록+단건 혼재)의
// 스펙에서 "브라우저 캡처 → 전체 Mock으로 → 프리셋 저장(IndexedDB)" 전 과정을 검증한다.
// 사내 CMDB 실 스펙으로 같은 시나리오를 로컬에서 재현해 통과를 확인했고(매칭 15/15, persisted),
// 이 테스트는 내부 데이터 없이 동일 구조를 회귀 가드로 남긴 것.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { parseSpec } from "./openapi-parser";
import { deriveBaseURL } from "./request-builder";
import { recordingsToMocks } from "./proxy-to-mock";
import type { ProxyRecord } from "./proxy-client";

// FastAPI식 OpenAPI 3.1 — server는 호스트만(경로 접두사 없음), paths는 /api/v1/... 전체경로.
const doc = {
  openapi: "3.1.0",
  info: { title: "CMDB-like", version: "1.0" },
  servers: [{ url: "http://api-dev.example.com" }],
  paths: Object.fromEntries(
    [
      "/api/v1/cmdb/stat/related-infra",
      "/api/v1/cmdb/storage/{storageId}/diagram",
      "/api/v1/cmdb/storage-unit",
      "/api/v1/cmdb/storage",
      "/api/v1/cmdb/infra",
      "/api/v1/cmdb/infra/{infraId}",
      "/api/v1/cmdb/infra/{infraId}/props",
      "/api/v1/cmdb/location-storage",
      "/api/v1/common/code/{codePId}",
      "/api/v1/cmdb/subnet",
      "/api/v1/cmdb/stat/location-tree",
      "/api/v1/cmdb/os",
      "/api/v1/cmdb/ip",
      "/api/v1/cmdb/search/{infraId}",
      "/api/v1/cmdb/device",
    ].map((p) => [p, { get: { responses: { "200": { description: "ok" } } } }]),
  ),
};

// 브라우저 모드에서 실제로 녹화되는 절대 경로(쿼리 포함)
const RECORDED = [
  "/api/v1/cmdb/stat/related-infra",
  "/api/v1/cmdb/storage/191/diagram",
  "/api/v1/cmdb/storage-unit",
  "/api/v1/cmdb/storage",
  "/api/v1/cmdb/infra",
  "/api/v1/cmdb/location-storage",
  "/api/v1/common/code/IP_STATUS?activeOnly=true",
  "/api/v1/cmdb/subnet",
  "/api/v1/cmdb/os",
  "/api/v1/cmdb/infra/18/props",
  "/api/v1/cmdb/ip?infraId=18",
  "/api/v1/cmdb/search/page?limit=50&offset=0",
  "/api/v1/cmdb/device",
  "/api/v1/cmdb/infra/18",
];

const spec = parseSpec(doc);
const specUrl = "https://api-dev.example.com/v3/api-docs";
const baseURL = deriveBaseURL(specUrl, spec.servers);

function bigListBody(n: number): string {
  return JSON.stringify(
    Array.from({ length: n }, (_, i) => ({
      id: i, name: `item-${i}`, description: "x".repeat(500), meta: { c: "y".repeat(300) },
    })),
  );
}

describe("실세계 형태 스펙 — 브라우저 캡처 매칭", () => {
  it("server가 호스트만이고 경로가 /api/v1/...여도 절대경로 녹화가 매칭된다", () => {
    expect(baseURL).toBe("http://api-dev.example.com");
    const records: ProxyRecord[] = RECORDED.map((p, i) => ({
      atMs: i, method: "GET", path: p, status: 200, responseBody: "[]",
    }));
    const result = recordingsToMocks(spec, records, baseURL);
    expect(result.unmatched).toBe(0);
    expect(result.targets.length).toBeGreaterThan(0);
  });
});

describe("실세계 형태 스펙 — 전체 저장→IndexedDB 영속→재로드", () => {
  let mod: typeof import("./proxy-to-mock");
  let storeMod: typeof import("./mock-presets-store");
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    vi.resetModules();
    mod = await import("./proxy-to-mock");
    storeMod = await import("./mock-presets-store");
  });

  it("대용량 응답을 전체 저장하면 프리셋이 IndexedDB에 영속되고 재로드된다", async () => {
    const records: ProxyRecord[] = RECORDED.map((p, i) => ({
      atMs: i, method: "GET", path: p, status: 200,
      responseBody: p.includes("?") || /\/\d+(\/|$)/.test(p.split("?")[0]) ? '{"id":1}' : bigListBody(50),
    }));
    const res = await mod.saveRecordingsToMock(spec, records, baseURL, specUrl, "CMDB 스냅샷");
    expect(res.saved).toBeGreaterThan(0);
    expect(res.persisted).toBe(true);

    const presets = await storeMod.loadPresets(specUrl);
    expect(presets).toHaveLength(1);
    expect(presets[0].title).toBe("CMDB 스냅샷");
    const subnet = presets[0].operations.find((o) => o.opId === "GET /api/v1/cmdb/subnet");
    expect(subnet?.enabled).toBe(true);
    expect((subnet?.dataset as unknown[])?.length).toBe(50);
  });
});
