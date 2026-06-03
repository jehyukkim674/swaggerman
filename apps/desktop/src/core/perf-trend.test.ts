import { describe, it, expect } from "vitest";
import { computePerfTrends, detectTrend, percentile } from "./perf-trend";
import type { HistoryItem } from "./history";

function h(opId: string, durationMs: number, executedAt: number, over: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: `${opId}-${executedAt}`, opId, method: opId.split(" ")[0], path: opId.split(" ")[1] ?? "/",
    url: "x", status: 200, durationMs, size: 0, executedAt,
    inputs: {} as HistoryItem["inputs"], responseHeaders: {}, responseBody: "",
    ...over,
  };
}

describe("percentile", () => {
  it("정렬된 값에서 백분위", () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40], 95)).toBe(40);
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([], 50)).toBe(0);
  });
});

describe("detectTrend", () => {
  it("증가 추세는 slower", () => {
    expect(detectTrend([10, 10, 100, 100])).toBe("slower");
  });
  it("감소 추세는 faster", () => {
    expect(detectTrend([100, 100, 10, 10])).toBe("faster");
  });
  it("평탄은 stable", () => {
    expect(detectTrend([50, 52, 48, 51])).toBe("stable");
  });
  it("4건 미만은 insufficient", () => {
    expect(detectTrend([10, 20, 30])).toBe("insufficient");
  });
});

describe("computePerfTrends", () => {
  const hist: HistoryItem[] = [
    h("GET /a", 100, 1), h("GET /a", 200, 2), h("GET /a", 300, 3),
    h("GET /b", 50, 1),
  ];
  it("opId별로 분리 집계한다", () => {
    const r = computePerfTrends(hist);
    const a = r.find((s) => s.opId === "GET /a")!;
    expect(a.count).toBe(3);
    expect(a.avgMs).toBe(200);
    expect(a.minMs).toBe(100);
    expect(a.maxMs).toBe(300);
    expect(a.series).toEqual([100, 200, 300]); // executedAt 순
  });
  it("평균 내림차순 정렬(느린 API 위로)", () => {
    const r = computePerfTrends(hist);
    expect(r[0].opId).toBe("GET /a"); // avg 200 > 50
  });
});
