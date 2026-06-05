// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { saveSpecCache, loadSpecCache } from "./spec-cache";
import type { ParsedSpec } from "./types";

function makeSpec(title: string): ParsedSpec {
  return {
    info: { title, version: "1.0" },
    servers: ["https://api.example.com"],
    operations: [
      { id: "GET /x", method: "GET", path: "/x", summary: "", tags: [], parameters: [], responses: [] },
    ],
    securitySchemes: [],
    rawOperationCount: 1,
  };
}

describe("spec-cache", () => {
  it("저장 후 로드하면 spec과 savedAt이 보존된다", async () => {
    const url = "https://round-trip.example/v3/api-docs";
    const before = Date.now();
    await saveSpecCache(url, makeSpec("라운드트립"));
    const got = await loadSpecCache(url);
    expect(got?.spec.info.title).toBe("라운드트립");
    expect(got?.spec.operations).toHaveLength(1);
    expect(got?.savedAt).toBeGreaterThanOrEqual(before);
  });

  it("캐시가 없는 URL은 null을 반환한다", async () => {
    const got = await loadSpecCache("https://never-saved.example/v3/api-docs");
    expect(got).toBeNull();
  });

  it("같은 URL을 다시 저장하면 최신값으로 덮어쓴다", async () => {
    const url = "https://overwrite.example/v3/api-docs";
    await saveSpecCache(url, makeSpec("이전"));
    const first = await loadSpecCache(url);
    await new Promise((r) => setTimeout(r, 2));
    await saveSpecCache(url, makeSpec("최신"));
    const second = await loadSpecCache(url);
    expect(second?.spec.info.title).toBe("최신");
    expect(second!.savedAt).toBeGreaterThanOrEqual(first!.savedAt);
  });
});
