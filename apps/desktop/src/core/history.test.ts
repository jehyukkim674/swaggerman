import { describe, it, expect } from "vitest";
import { newId, relativeTime } from "./history";

describe("relativeTime", () => {
  const now = Date.now();
  it("1분 미만 → 방금 전", () => expect(relativeTime(now - 5_000)).toBe("방금 전"));
  it("분 단위", () => expect(relativeTime(now - 3 * 60_000)).toBe("3분 전"));
  it("시간 + 분", () => expect(relativeTime(now - 90 * 60_000)).toBe("1시간 30분 전"));
  it("정시 시간", () => expect(relativeTime(now - 2 * 3_600_000)).toBe("2시간 전"));
  it("일 단위", () => expect(relativeTime(now - 3 * 86_400_000)).toBe("3일 전"));
});

describe("newId", () => {
  it("1000개 생성해도 모두 고유", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
  });
});
