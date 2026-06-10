// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MockOperationConfig } from "./mock-config";
import { IDBFactory } from "fake-indexeddb";

const url = "https://api.test/openapi.json";

function ops(): MockOperationConfig[] {
  return [
    { opId: "GET /items", enabled: true, source: "manual", status: 200, delayMs: 0, itemCount: 20, seed: 1, dataset: [{ id: 1 }] },
    { opId: "GET /pets", enabled: false, source: "schema", status: 200, delayMs: 0, itemCount: 20, seed: 1 },
  ];
}

// dbPromise가 모듈에 캐시되므로, 매 테스트마다 IndexedDB와 모듈을 새로 만들어 격리한다.
let store: typeof import("./mock-presets-store");
beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  vi.resetModules();
  store = await import("./mock-presets-store");
});

describe("mock-presets-store (IndexedDB)", () => {
  it("loadPresets는 없으면 빈 배열", async () => {
    expect(await store.loadPresets(url)).toEqual([]);
  });

  it("savePreset은 id·savedAt을 부여하고 맨 앞에 추가하며 생성된 프리셋을 반환한다", async () => {
    const a = await store.savePreset(url, "첫째", ops());
    const b = await store.savePreset(url, "둘째", ops());
    expect(a).not.toBeNull();
    expect(a!.id).toBeTruthy();
    expect(a!.savedAt).toBeGreaterThan(0);
    expect(b!.operations).toHaveLength(2);
    const list = await store.loadPresets(url);
    expect(list.map((p) => p.title)).toEqual(["둘째", "첫째"]); // 최신 우선
    expect(list[1].id).toBe(a!.id);
  });

  it("savePreset은 operations를 딥클론해 원본 변형에 영향받지 않는다", async () => {
    const arr = ops();
    await store.savePreset(url, "x", arr);
    arr[0].status = 999;
    const list = await store.loadPresets(url);
    expect(list[0].operations[0].status).toBe(200);
  });

  it("deletePreset은 해당 id만 제거한다", async () => {
    const a = await store.savePreset(url, "a", ops());
    const b = await store.savePreset(url, "b", ops());
    await store.deletePreset(url, a!.id);
    expect((await store.loadPresets(url)).map((p) => p.id)).toEqual([b!.id]);
  });

  it("renamePreset은 제목만 바꾼다", async () => {
    const a = await store.savePreset(url, "old", ops());
    await store.renamePreset(url, a!.id, "new");
    const list = await store.loadPresets(url);
    expect(list[0].title).toBe("new");
    expect(list[0].id).toBe(a!.id);
  });

  it("스펙별로 분리 저장된다", async () => {
    await store.savePreset(url, "A", ops());
    await store.savePreset("https://other/spec.json", "B", ops());
    expect((await store.loadPresets(url)).map((p) => p.title)).toEqual(["A"]);
    expect((await store.loadPresets("https://other/spec.json")).map((p) => p.title)).toEqual(["B"]);
  });

  it("localStorage로는 불가능한 대용량(8MB+) 프리셋도 저장·로드된다", async () => {
    // 약 8MB짜리 dataset — localStorage 한도(~5MB)를 초과하는 크기
    const big = Array.from({ length: 8000 }, (_, i) => ({ id: i, blob: "x".repeat(1000) }));
    const bigOps: MockOperationConfig[] = [
      { opId: "GET /big", enabled: true, source: "manual", status: 200, delayMs: 0, itemCount: 20, seed: 1, dataset: big },
    ];
    const saved = await store.savePreset(url, "대용량", bigOps);
    expect(saved).not.toBeNull();
    const list = await store.loadPresets(url);
    expect(list).toHaveLength(1);
    expect((list[0].operations[0].dataset as unknown[]).length).toBe(8000);
  });

  it("구버전 localStorage 프리셋을 IndexedDB로 마이그레이션한다", async () => {
    const legacy = [{ id: "leg-1", title: "옛프리셋", savedAt: 1, operations: ops() }];
    localStorage.setItem(`swaggerman.mock.presets.${url}`, JSON.stringify(legacy));
    const list = await store.loadPresets(url);
    expect(list.map((p) => p.title)).toEqual(["옛프리셋"]);
    // localStorage에서 제거되고 IndexedDB로 옮겨짐
    expect(localStorage.getItem(`swaggerman.mock.presets.${url}`)).toBeNull();
    expect((await store.loadPresets(url)).map((p) => p.title)).toEqual(["옛프리셋"]);
  });
});
