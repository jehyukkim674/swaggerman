// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { removeSpecLocalData, PER_SPEC_KEY_PREFIXES } from "./project-cleanup";
import { saveStoredMockConfig, loadStoredMockConfig } from "./mock-config-store";
import { savePreset, loadPresets } from "./mock-presets-store";
import { saveSpecCache, loadSpecCache } from "./spec-cache";
import type { MockServerConfig } from "./mock-config";
import type { ParsedSpec } from "./types";

const url = "https://api.test/openapi.json";
const otherUrl = "https://other.test/spec.json";

const cfg: MockServerConfig = { port: 9090, operations: [], requests: [] };
const spec: ParsedSpec = {
  info: { title: "t", version: "1" },
  servers: [],
  operations: [],
  securitySchemes: [],
  rawOperationCount: 0,
};

beforeEach(() => {
  localStorage.clear();
});

describe("removeSpecLocalData", () => {
  it("스펙별 localStorage 키를 모두 지운다(다른 스펙은 유지)", async () => {
    for (const prefix of PER_SPEC_KEY_PREFIXES) {
      localStorage.setItem(`${prefix}${url}`, "x");
      localStorage.setItem(`${prefix}${otherUrl}`, "keep");
    }
    localStorage.setItem("swaggerman.collections", "global-keep"); // 전역 키는 유지

    await removeSpecLocalData(url);

    for (const prefix of PER_SPEC_KEY_PREFIXES) {
      expect(localStorage.getItem(`${prefix}${url}`)).toBeNull();
      expect(localStorage.getItem(`${prefix}${otherUrl}`)).toBe("keep");
    }
    expect(localStorage.getItem("swaggerman.collections")).toBe("global-keep");
  });

  it("Mock 관련 키(mock.·레거시 presets·notes·envs·snapshots 등)가 정리 목록에 포함된다", () => {
    // removeProject가 빠뜨렸던 키들의 회귀 가드
    for (const required of [
      "swaggerman.mock.",
      "swaggerman.mock.presets.",
      "swaggerman.notes.",
      "swaggerman.envs.",
      "swaggerman.activeEnv.",
      "swaggerman.flows.",
      "swaggerman.snapshots.",
      "swaggerman.ttconfig.",
      "swaggerman.assert.",
      "swaggerman.extract.",
      "swaggerman.headers.",
      "swaggerman.aichat.",
      "swaggerman.personas.",
      "swaggerman.samples.",
      "swaggerman.fav.",
      "swaggerman.hist.",
      "swaggerman.auth.",
      "swaggerman.inputs.",
      "swaggerman.lastOp.",
      "swaggerman.baseURL.",
    ]) {
      expect(PER_SPEC_KEY_PREFIXES).toContain(required);
    }
  });

  it("IndexedDB의 Mock 설정·프리셋·스펙 캐시도 지운다(다른 스펙은 유지)", async () => {
    await saveStoredMockConfig(url, cfg);
    await saveStoredMockConfig(otherUrl, cfg);
    await savePreset(url, "p", []);
    await savePreset(otherUrl, "p2", []);
    await saveSpecCache(url, spec);
    await saveSpecCache(otherUrl, spec);

    await removeSpecLocalData(url);

    expect(await loadStoredMockConfig(url)).toBeNull();
    expect(await loadPresets(url)).toEqual([]);
    expect(await loadSpecCache(url)).toBeNull();
    // 다른 스펙은 그대로
    expect(await loadStoredMockConfig(otherUrl)).not.toBeNull();
    expect((await loadPresets(otherUrl)).length).toBe(1);
    expect(await loadSpecCache(otherUrl)).not.toBeNull();
  });
});
