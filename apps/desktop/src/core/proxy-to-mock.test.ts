// src/core/proxy-to-mock.test.ts
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { matchOperation, recordingToMock, recordingsToMocks, applyMockTargets, stripBasePath } from "./proxy-to-mock";
import { defaultMockConfig } from "./mock-config";
import { IDBFactory } from "fake-indexeddb";
import type { ParsedSpec } from "./types";
import type { ProxyRecord } from "./proxy-client";

/** 최소 스펙 픽스처 생성. ops는 { id, method, path } 배열. */
function makeSpec(ops: { id: string; method: string; path: string }[]): ParsedSpec {
  const operations = ops.map((o) => ({
    id: o.id,
    method: o.method,
    path: o.path,
    tags: [],
    parameters: [],
    responses: [],
  }));
  return { info: { title: "t", version: "1" }, operations, securitySchemes: [] } as unknown as ParsedSpec;
}

const spec = makeSpec([
  { id: "GET /pet/findByStatus", method: "GET", path: "/pet/findByStatus" },
  { id: "GET /pet/{petId}", method: "GET", path: "/pet/{petId}" },
  { id: "POST /pet", method: "POST", path: "/pet" },
]);

function rec(over: Partial<ProxyRecord>): ProxyRecord {
  return { atMs: 1, method: "GET", path: "/pet/findByStatus", status: 200, responseBody: "[]", ...over };
}

describe("matchOperation", () => {
  it("정확 경로 매칭", () => {
    expect(matchOperation(spec, "GET", "/pet/findByStatus")?.id).toBe("GET /pet/findByStatus");
  });
  it("path param 매칭", () => {
    expect(matchOperation(spec, "GET", "/pet/42")?.id).toBe("GET /pet/{petId}");
  });
  it("method 다르면 매칭 안 됨", () => {
    expect(matchOperation(spec, "DELETE", "/pet/42")).toBeNull();
  });
  it("없는 경로는 null", () => {
    expect(matchOperation(spec, "GET", "/unknown")).toBeNull();
  });
});

describe("recordingToMock", () => {
  it("배열 응답은 dataset으로, 매칭 opId 반환", () => {
    const r = recordingToMock(spec, rec({ responseBody: '[{"id":1}]' }));
    expect(r?.opId).toBe("GET /pet/findByStatus");
    expect(r?.dataset).toEqual([{ id: 1 }]);
    expect(r?.body).toBeUndefined();
  });
  it("객체 응답은 body로", () => {
    const r = recordingToMock(spec, rec({ method: "GET", path: "/pet/42", responseBody: '{"id":42}' }));
    expect(r?.opId).toBe("GET /pet/{petId}");
    expect(r?.body).toEqual({ id: 42 });
    expect(r?.dataset).toBeUndefined();
  });
  it("매칭 operation 없으면 null", () => {
    expect(recordingToMock(spec, rec({ path: "/nope" }))).toBeNull();
  });
  it("JSON 아닌 응답은 body 문자열로", () => {
    const r = recordingToMock(spec, rec({ responseBody: "plain text" }));
    expect(r?.body).toBe("plain text");
  });
});

describe("recordingsToMocks", () => {
  it("녹화 전체를 변환하고 같은 operation은 최신 녹화가 이긴다", () => {
    const result = recordingsToMocks(spec, [
      rec({ atMs: 1, responseBody: '[{"id":1}]' }),
      rec({ atMs: 2, method: "POST", path: "/pet", responseBody: '{"ok":true}' }),
      rec({ atMs: 3, responseBody: '[{"id":2}]' }), // 같은 GET /pet/findByStatus → 이게 이김
    ]);
    expect(result.targets).toHaveLength(2);
    const list = result.targets.find((t) => t.opId === "GET /pet/findByStatus");
    expect(list?.dataset).toEqual([{ id: 2 }]);
    expect(result.unmatched).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("매칭 안 되는 녹화와 실패 녹화는 제외하고 센다", () => {
    const result = recordingsToMocks(spec, [
      rec({ path: "/nope" }),
      rec({ error: "포워딩 실패", responseBody: "" }),
      rec({ responseBody: "[]" }),
    ]);
    expect(result.targets).toHaveLength(1);
    expect(result.unmatched).toBe(1);
    expect(result.failed).toBe(1);
  });
});

describe("applyMockTargets", () => {
  it("대상 operation에 enabled·manual·dataset/body를 설정한다", () => {
    const cfg = defaultMockConfig(spec);
    cfg.operations[0].enabled = false;
    applyMockTargets(cfg, [
      { opId: "GET /pet/findByStatus", dataset: [{ id: 1 }] },
      { opId: "POST /pet", body: { ok: true } },
    ]);
    const list = cfg.operations.find((o) => o.opId === "GET /pet/findByStatus")!;
    expect(list.enabled).toBe(true);
    expect(list.source).toBe("manual");
    expect(list.dataset).toEqual([{ id: 1 }]);
    const post = cfg.operations.find((o) => o.opId === "POST /pet")!;
    expect(post.body).toEqual({ ok: true });
  });

  it("없는 opId는 무시한다", () => {
    const cfg = defaultMockConfig(spec);
    expect(() => applyMockTargets(cfg, [{ opId: "ghost" }])).not.toThrow();
  });
});

describe("stripBasePath", () => {
  it("baseUrl의 path 접두사를 제거한다", () => {
    expect(stripBasePath("/api/v1/pets/42", "https://host.com/api/v1")).toBe("/pets/42");
    expect(stripBasePath("/api/v1", "https://host.com/api/v1")).toBe("/");
  });

  it("접두사가 아니면 원본 그대로", () => {
    expect(stripBasePath("/other/pets", "https://host.com/api/v1")).toBe("/other/pets");
    expect(stripBasePath("/api/v1extra/x", "https://host.com/api/v1")).toBe("/api/v1extra/x");
  });

  it("baseUrl에 경로가 없거나 URL이 아니면 원본 그대로", () => {
    expect(stripBasePath("/pets", "https://host.com")).toBe("/pets");
    expect(stripBasePath("/pets", "not a url")).toBe("/pets");
  });

  it("baseUrl의 trailing slash는 무시하고 접두사를 제거한다", () => {
    expect(stripBasePath("/api/v1/pets", "https://host.com/api/v1/")).toBe("/pets");
  });

  it("쿼리만 있는 경우 슬래시를 앞에 붙인다", () => {
    expect(stripBasePath("/api/v1?x=1", "https://host.com/api/v1")).toBe("/?x=1");
  });
});

describe("recordingToMock baseUrl 폴백", () => {
  it("절대 경로 녹화도 baseUrl 접두사를 떼고 매칭한다", () => {
    // 기존 테스트와 동일한 방식의 spec 픽스처: GET /pets operation 1개
    const spec = makeSpec([{ id: "getPets", method: "get", path: "/pets" }]);
    const record: ProxyRecord = {
      atMs: 1, method: "GET", path: "/api/v1/pets?limit=2", status: 200, responseBody: "[]",
    };
    expect(recordingToMock(spec, record)).toBeNull(); // baseUrl 없으면 종전대로 실패
    const target = recordingToMock(spec, record, "https://host.com/api/v1");
    expect(target?.opId).toBe("getPets");
  });
});

describe("saveRecordingsToMock (전체저장 = IndexedDB 프리셋으로 저장)", () => {
  const url = "https://api.test/openapi.json";
  // dbPromise 모듈 캐시 격리 — 매 테스트마다 새 IndexedDB + 모듈 재import
  let mod: typeof import("./proxy-to-mock");
  let storeMod: typeof import("./mock-presets-store");
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    vi.resetModules();
    mod = await import("./proxy-to-mock");
    storeMod = await import("./mock-presets-store");
  });

  it("녹화를 IndexedDB 프리셋으로 저장(persisted)하고 활성 설정은 건드리지 않는다", async () => {
    const spec = makeSpec([{ id: "GET /pets", method: "GET", path: "/pets" }]);
    const records: ProxyRecord[] = [
      { atMs: 1, method: "GET", path: "/pets", status: 200, responseBody: '[{"id":1}]' },
    ];
    const res = await mod.saveRecordingsToMock(spec, records, "https://api.test", url, "스모크");
    expect(res).toEqual({ saved: 1, unmatched: 0, failed: 0, persisted: true });

    // 프리셋에 녹화 매칭분 반영(Mock에서 선택해 적용)
    const presets = await storeMod.loadPresets(url);
    expect(presets).toHaveLength(1);
    expect(presets[0].title).toBe("스모크");
    const presetOp = presets[0].operations.find((o) => o.opId === "GET /pets")!;
    expect(presetOp.enabled).toBe(true);
    expect(presetOp.source).toBe("manual");
    expect(presetOp.dataset).toEqual([{ id: 1 }]);

    // 활성 설정(localStorage)은 변경하지 않는다
    expect(localStorage.getItem(`swaggerman.mock.${url}`)).toBeNull();
  });

  it("매칭 0건이면 프리셋을 만들지 않는다(persisted=false)", async () => {
    const spec = makeSpec([{ id: "GET /pets", method: "GET", path: "/pets" }]);
    const records: ProxyRecord[] = [
      { atMs: 1, method: "GET", path: "/unknown", status: 200, responseBody: "[]" },
    ];
    const res = await mod.saveRecordingsToMock(spec, records, "https://api.test", url, "x");
    expect(res).toEqual({ saved: 0, unmatched: 1, failed: 0, persisted: false });
    expect(await storeMod.loadPresets(url)).toHaveLength(0);
  });

  it("실패 녹화·미매칭 건수를 결과에 함께 반환한다", async () => {
    const spec = makeSpec([{ id: "GET /pets", method: "GET", path: "/pets" }]);
    const records: ProxyRecord[] = [
      { atMs: 1, method: "GET", path: "/pets", status: 200, responseBody: '[{"id":1}]' },
      { atMs: 2, method: "GET", path: "/nope", status: 404, responseBody: "" },
      { atMs: 3, method: "GET", path: "/pets", status: 500, responseBody: "", error: "boom" },
    ];
    const res = await mod.saveRecordingsToMock(spec, records, "https://api.test", url, "t");
    expect(res).toEqual({ saved: 1, unmatched: 1, failed: 1, persisted: true });
  });
});
