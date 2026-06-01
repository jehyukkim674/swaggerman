import { describe, it, expect } from "vitest";
import { buildMinimapBuckets } from "./minimap";

describe("buildMinimapBuckets", () => {
  it("bucketCount<=0 또는 빈 lines면 빈 배열", () => {
    expect(buildMinimapBuckets([], 100, new Set())).toEqual([]);
    expect(buildMinimapBuckets(["a", "b"], 0, new Set())).toEqual([]);
    expect(buildMinimapBuckets(["a"], -5, new Set())).toEqual([]);
  });

  it("lines.length <= bucketCount면 줄당 1버킷(lines.length개) 반환", () => {
    const buckets = buildMinimapBuckets(["a", "bb", "ccc"], 100, new Set());
    expect(buckets).toHaveLength(3);
  });

  it("len을 전체 최대 길이로 0~1 정규화한다", () => {
    // 최대 길이 4 → 길이 4 버킷은 1.0, 길이 2 버킷은 0.5
    const buckets = buildMinimapBuckets(["aa", "bbbb"], 100, new Set());
    expect(buckets[0].len).toBeCloseTo(0.5);
    expect(buckets[1].len).toBeCloseTo(1);
  });

  it("버킷 내 매치 줄이 하나라도 있으면 match=true", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i}`);
    const buckets = buildMinimapBuckets(lines, 2, new Set([0]));
    expect(buckets).toHaveLength(2);
    expect(buckets[0].match).toBe(true);
    expect(buckets[1].match).toBe(false);
  });

  it("줄 수가 bucketCount보다 많으면 bucketCount개로 집계", () => {
    const lines = Array.from({ length: 1000 }, () => "x");
    const buckets = buildMinimapBuckets(lines, 50, new Set());
    expect(buckets).toHaveLength(50);
  });

  it("20만 줄 입력에도 크래시 없이 bucketCount개 반환(스프레드 스택초과 방지)", () => {
    const lines = Array.from({ length: 200000 }, (_, i) => "y".repeat((i % 80) + 1));
    const buckets = buildMinimapBuckets(lines, 400, new Set([100000]));
    expect(buckets).toHaveLength(400);
    // 길이 정규화는 0~1 범위
    for (const b of buckets) {
      expect(b.len).toBeGreaterThanOrEqual(0);
      expect(b.len).toBeLessThanOrEqual(1);
    }
    // 매치 줄(100000)이 속한 버킷은 match=true
    expect(buckets.some((b) => b.match)).toBe(true);
  });
});

describe("buildMinimapBuckets — marks 색상", () => {
  it("marks가 있는 줄의 버킷은 color를 가진다", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i}`);
    const marks = new Map<number, string>([[0, "#3fb950"]]);
    const buckets = buildMinimapBuckets(lines, 2, new Set(), marks);
    expect(buckets).toHaveLength(2);
    expect(buckets[0].color).toBe("#3fb950");
    expect(buckets[1].color).toBeUndefined();
  });

  it("버킷 내 첫 marks 색을 쓴다", () => {
    // 한 버킷에 여러 marks가 있어도 가장 앞 줄의 색을 채택
    const lines = Array.from({ length: 4 }, (_, i) => `line${i}`);
    const marks = new Map<number, string>([
      [0, "#3fb950"],
      [1, "#f85149"],
    ]);
    const buckets = buildMinimapBuckets(lines, 1, new Set(), marks);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].color).toBe("#3fb950");
  });

  it("match가 있는 버킷은 match=true가 우선(color와 공존 가능)", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i}`);
    const marks = new Map<number, string>([[0, "#3fb950"]]);
    const buckets = buildMinimapBuckets(lines, 2, new Set([0]), marks);
    expect(buckets[0].match).toBe(true);
    expect(buckets[0].color).toBe("#3fb950");
  });

  it("marks 없이 호출하면 기존과 동일(color 모두 undefined)", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i}`);
    const buckets = buildMinimapBuckets(lines, 3, new Set([0]));
    expect(buckets).toHaveLength(3);
    for (const b of buckets) {
      expect(b.color).toBeUndefined();
    }
  });
});
