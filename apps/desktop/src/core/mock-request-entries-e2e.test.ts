// @vitest-environment jsdom
// E2E: 프록시 캡처 → "전체 Mock으로" 프리셋 저장 → 재로드 → 프리셋 선택(applyPresetToConfig)
// → config.requests에 요청 엔트리가 실려 MockRequestsPanel이 표시할 수 있는지 끝까지 검증.
// (사용자 버그 "프리셋 선택 시 녹화 내용 안보임" = config.requests엔 있으나 UI 없음 → UI 추가 후 회귀 가드)
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { loadMockConfig, applyPresetToConfig } from "./mock-config";
import type { ParsedSpec } from "./types";
import type { ProxyRecord } from "./proxy-client";

const spec = { info: { title: "t", version: "1" }, servers: ["http://h"], operations: [], securitySchemes: [] } as unknown as ParsedSpec;
const url = "https://cmdb/v3/api-docs";

const RECORDS: ProxyRecord[] = [
  { atMs: 1, method: "GET", path: "/api/v1/common/code/IP_STATUS?activeOnly=true", status: 200, responseBody: '[{"id":1,"name":"가용"}]' },
  { atMs: 2, method: "GET", path: "/api/v1/common/code/IP_USAGE?activeOnly=true", status: 200, responseBody: '[{"id":2,"name":"사용중"}]' },
  { atMs: 3, method: "GET", path: "/api/v1/cmdb/device", status: 200, responseBody: '[{"id":7}]' },
];

describe("E2E — 캡처→프리셋→선택→요청 엔트리 표시 데이터", () => {
  let mod: typeof import("./proxy-to-mock");
  let store: typeof import("./mock-presets-store");
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    vi.resetModules();
    mod = await import("./proxy-to-mock");
    store = await import("./mock-presets-store");
  });

  it("프리셋 선택 시 config.requests에 캡처 요청들이 그대로 실린다(IP_STATUS≠IP_USAGE)", async () => {
    // 1) 캡처 전체 저장 → 프리셋
    const res = await mod.saveRecordingsToMock(spec, RECORDS, "http://h", url, "CMDB");
    expect(res.persisted).toBe(true);
    expect(res.saved).toBe(3);

    // 2) Mock 모달 재오픈 시뮬레이션 — 프리셋 로드
    const presets = await store.loadPresets(url);
    expect(presets).toHaveLength(1);
    expect(presets[0].requests).toHaveLength(3);

    // 3) 프리셋 선택 = applyPresetToConfig → config.requests에 반영(패널이 받는 값)
    const config = loadMockConfig(url, spec); // 활성 config(requests 비어있음)
    expect(config.requests).toHaveLength(0);
    const applied = applyPresetToConfig(config, presets[0]);

    // 4) 패널이 표시할 데이터: 두 코드가 별도 엔트리로 살아있음
    expect(applied.requests).toHaveLength(3);
    const codeEntries = applied.requests.filter((r) => r.path.includes("/common/code/"));
    expect(codeEntries.map((e) => e.path).sort()).toEqual([
      "/api/v1/common/code/IP_STATUS",
      "/api/v1/common/code/IP_USAGE",
    ]);
    const ipStatus = applied.requests.find((r) => r.path === "/api/v1/common/code/IP_STATUS")!;
    expect(ipStatus.query).toEqual([{ name: "activeOnly", value: "true" }]);
    expect(ipStatus.body).toEqual([{ id: 1, name: "가용" }]);
    const ipUsage = applied.requests.find((r) => r.path === "/api/v1/common/code/IP_USAGE")!;
    expect(ipUsage.body).toEqual([{ id: 2, name: "사용중" }]);
  });
});
