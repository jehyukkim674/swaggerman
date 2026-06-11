// src/core/proxy-to-mock.test.ts
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { matchOperation, recordingToMock, recordingsToMocks, applyMockTargets, stripBasePath, recordingToRequestEntry, recordingsToRequestEntries } from "./proxy-to-mock";
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

describe("녹화 → 요청 엔트리", () => {
  it("recordingToRequestEntry는 경로/쿼리/응답을 엔트리로 변환한다", () => {
    const e = recordingToRequestEntry({
      atMs: 1, method: "GET", path: "/api/v1/code/IP_STATUS?activeOnly=true",
      status: 200, responseBody: '[{"id":1}]',
    });
    expect(e.method).toBe("GET");
    expect(e.path).toBe("/api/v1/code/IP_STATUS");
    expect(e.query).toEqual([{ name: "activeOnly", value: "true" }]);
    expect(e.status).toBe(200);
    expect(e.body).toEqual([{ id: 1 }]);
    expect(e.id).toBeTruthy();
  });

  it("JSON 아닌 응답은 원문 문자열 body", () => {
    const e = recordingToRequestEntry({ atMs: 1, method: "GET", path: "/x", status: 200, responseBody: "plain" });
    expect(e.body).toBe("plain");
    expect(e.query).toBeUndefined();
  });

  it("recordingsToRequestEntries는 같은 method+path+query 중 최신이 이기고 실패는 제외한다", () => {
    const { entries, failed } = recordingsToRequestEntries([
      { atMs: 1, method: "GET", path: "/api/v1/code/IP_STATUS", status: 200, responseBody: '{"v":1}' },
      { atMs: 2, method: "GET", path: "/api/v1/code/IP_USAGE", status: 200, responseBody: '{"v":2}' },
      { atMs: 3, method: "GET", path: "/api/v1/code/IP_STATUS", status: 200, responseBody: '{"v":3}' }, // 최신
      { atMs: 4, method: "GET", path: "/api/v1/code/X", status: 500, responseBody: "", error: "boom" },
    ]);
    expect(failed).toBe(1);
    expect(entries).toHaveLength(2);
    const ipStatus = entries.find((e) => e.path === "/api/v1/code/IP_STATUS")!;
    expect(ipStatus.body).toEqual({ v: 3 }); // 최신 이김
    expect(entries.some((e) => e.path === "/api/v1/code/IP_USAGE")).toBe(true);
  });

  it("쿼리 값에 '?'가 있어도 첫 '?'에서만 분리해 나머지를 보존한다", () => {
    const e = recordingToRequestEntry({
      atMs: 1, method: "GET", path: "/search?q=a?b&x=1", status: 200, responseBody: "{}",
    });
    expect(e.path).toBe("/search");
    expect(e.query).toEqual([
      { name: "q", value: "a?b" },
      { name: "x", value: "1" },
    ]);
  });

  it("쿼리 순서만 다른 같은 요청은 하나로 합쳐진다(최신이 이김)", () => {
    const { entries } = recordingsToRequestEntries([
      { atMs: 1, method: "GET", path: "/s?a=1&b=2", status: 200, responseBody: '{"v":1}' },
      { atMs: 2, method: "GET", path: "/s?b=2&a=1", status: 200, responseBody: '{"v":2}' },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].body).toEqual({ v: 2 });
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

  it("녹화를 요청 엔트리로 프리셋에 저장(persisted)한다", async () => {
    const spec = makeSpec([{ id: "GET /pets", method: "GET", path: "/pets" }]);
    const records: ProxyRecord[] = [
      { atMs: 1, method: "GET", path: "/api/v1/code/IP_STATUS?activeOnly=true", status: 200, responseBody: '[{"id":1}]' },
      { atMs: 2, method: "GET", path: "/api/v1/code/IP_USAGE?activeOnly=true", status: 200, responseBody: '[{"id":2}]' },
    ];
    const res = await mod.saveRecordingsToMock(spec, records, "https://api.test", url, "스냅샷");
    expect(res).toEqual({ saved: 2, unmatched: 0, failed: 0, persisted: true });
    const presets = await storeMod.loadPresets(url);
    expect(presets[0].requests).toHaveLength(2);
    const paths = presets[0].requests!.map((r) => r.path).sort();
    expect(paths).toEqual(["/api/v1/code/IP_STATUS", "/api/v1/code/IP_USAGE"]);
  });

  it("error 녹화만 있으면 프리셋을 만들지 않는다(persisted=false)", async () => {
    const spec = makeSpec([{ id: "GET /pets", method: "GET", path: "/pets" }]);
    const records: ProxyRecord[] = [
      { atMs: 1, method: "GET", path: "/x", status: 500, responseBody: "", error: "boom" },
    ];
    const res = await mod.saveRecordingsToMock(spec, records, "https://api.test", url, "x");
    expect(res).toEqual({ saved: 0, unmatched: 0, failed: 1, persisted: false });
    expect(await storeMod.loadPresets(url)).toHaveLength(0);
  });

  it("실패 녹화 건수를 결과에 반환하고 성공 녹화는 저장된다", async () => {
    const spec = makeSpec([{ id: "GET /pets", method: "GET", path: "/pets" }]);
    const records: ProxyRecord[] = [
      { atMs: 1, method: "GET", path: "/pets", status: 200, responseBody: '[{"id":1}]' },
      { atMs: 2, method: "GET", path: "/nope", status: 404, responseBody: '{"err":"not found"}' },
      { atMs: 3, method: "GET", path: "/pets", status: 500, responseBody: "", error: "boom" },
    ];
    const res = await mod.saveRecordingsToMock(spec, records, "https://api.test", url, "t");
    // /nope는 이제 spec 매칭 불필요 — 엔트리로 저장됨(unmatched=0). /pets 최신이 이김. error=1.
    expect(res).toEqual({ saved: 2, unmatched: 0, failed: 1, persisted: true });
  });
});
