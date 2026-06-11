// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MockServerConfig } from "./mock-config";
import { IDBFactory } from "fake-indexeddb";

const url = "https://api.test/openapi.json";

function cfg(partial: Partial<MockServerConfig> = {}): MockServerConfig {
  return {
    port: 9090,
    operations: [
      { opId: "GET /items", enabled: true, source: "manual", status: 200, delayMs: 0, itemCount: 20, seed: 1, dataset: [{ id: 1 }] },
    ],
    requests: [
      { id: "r1", method: "GET", path: "/api/v1/code/IP_STATUS", status: 200, body: { ok: true }, delayMs: 0 },
    ],
    ...partial,
  };
}

// dbPromise가 모듈에 캐시되므로, 매 테스트마다 IndexedDB와 모듈을 새로 만들어 격리한다.
let store: typeof import("./mock-config-store");
beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  vi.resetModules();
  store = await import("./mock-config-store");
});

describe("mock-config-store (IndexedDB)", () => {
  it("저장된 설정이 없으면 null", async () => {
    expect(await store.loadStoredMockConfig(url)).toBeNull();
  });

  it("save→load 라운드트립으로 설정을 그대로 보존한다", async () => {
    const config = cfg();
    expect(await store.saveStoredMockConfig(url, config)).toBe(true);
    const loaded = await store.loadStoredMockConfig(url);
    expect(loaded).toEqual(config);
  });

  it("같은 specUrl 재저장은 덮어쓴다", async () => {
    await store.saveStoredMockConfig(url, cfg({ port: 9090 }));
    await store.saveStoredMockConfig(url, cfg({ port: 9999 }));
    expect((await store.loadStoredMockConfig(url))?.port).toBe(9999);
  });

  it("스펙별로 분리 저장된다", async () => {
    await store.saveStoredMockConfig(url, cfg({ port: 1111 }));
    await store.saveStoredMockConfig("https://other/spec.json", cfg({ port: 2222 }));
    expect((await store.loadStoredMockConfig(url))?.port).toBe(1111);
    expect((await store.loadStoredMockConfig("https://other/spec.json"))?.port).toBe(2222);
  });

  it("deleteStoredMockConfig 후에는 null", async () => {
    await store.saveStoredMockConfig(url, cfg());
    await store.deleteStoredMockConfig(url);
    expect(await store.loadStoredMockConfig(url)).toBeNull();
  });

  it("localStorage로는 불가능한 대용량(8MB+) 요청 엔트리도 저장·로드된다", async () => {
    // 캡처 프리셋을 적용한 활성 설정 — localStorage 한도(~5MB)를 초과하는 크기
    const bigRequests = Array.from({ length: 8000 }, (_, i) => ({
      id: `r${i}`, method: "GET", path: `/api/v1/big/${i}`, status: 200,
      body: { blob: "x".repeat(1000) }, delayMs: 0,
    }));
    const ok = await store.saveStoredMockConfig(url, cfg({ requests: bigRequests }));
    expect(ok).toBe(true);
    const loaded = await store.loadStoredMockConfig(url);
    expect(loaded?.requests).toHaveLength(8000);
  });
});
