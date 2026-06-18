import { describe, it, expect } from "vitest";
import {
  newId,
  relativeTime,
  clampHistoryBody,
  MAX_HISTORY_BODY,
  filterHistory,
  isFilterActive,
  EMPTY_HISTORY_FILTER,
  type HistoryFilter,
  type HistoryItem,
} from "./history";

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

describe("clampHistoryBody", () => {
  it("한도 이하 본문은 그대로 + truncated=false", () => {
    const body = "a".repeat(1024);
    expect(clampHistoryBody(body)).toEqual({ body, truncated: false });
  });
  it("정확히 한도(경계값)는 절단 안 함", () => {
    const body = "a".repeat(MAX_HISTORY_BODY);
    const result = clampHistoryBody(body);
    expect(result.truncated).toBe(false);
    expect(result.body.length).toBe(MAX_HISTORY_BODY);
  });
  it("한도 초과 본문은 MAX_HISTORY_BODY 길이로 절단 + truncated=true", () => {
    const body = "a".repeat(MAX_HISTORY_BODY + 5000);
    const result = clampHistoryBody(body);
    expect(result.truncated).toBe(true);
    expect(result.body.length).toBe(MAX_HISTORY_BODY);
  });
});

describe("isFilterActive", () => {
  it("빈 필터는 비활성", () => expect(isFilterActive(EMPTY_HISTORY_FILTER)).toBe(false));
  it("공백만 있는 텍스트는 비활성", () =>
    expect(isFilterActive({ ...EMPTY_HISTORY_FILTER, text: "  " })).toBe(false));
  it("텍스트 있으면 활성", () =>
    expect(isFilterActive({ ...EMPTY_HISTORY_FILTER, text: "users" })).toBe(true));
  it("메서드 선택 시 활성", () =>
    expect(isFilterActive({ ...EMPTY_HISTORY_FILTER, methods: ["GET"] })).toBe(true));
  it("상태 그룹 선택 시 활성", () =>
    expect(isFilterActive({ ...EMPTY_HISTORY_FILTER, statusGroups: [2] })).toBe(true));
  it("시간 cutoff 있으면 활성", () =>
    expect(isFilterActive({ ...EMPTY_HISTORY_FILTER, since: 1000 })).toBe(true));
});

describe("filterHistory", () => {
  const mk = (over: Partial<HistoryItem>): HistoryItem => ({
    id: newId(),
    opId: "op",
    method: "GET",
    path: "/pets",
    url: `https://api.test${over.path ?? "/pets"}`,
    status: 200,
    durationMs: 10,
    size: 100,
    executedAt: 1_000_000,
    inputs: {} as HistoryItem["inputs"],
    responseHeaders: {},
    responseBody: "",
    ...over,
  });
  const items: HistoryItem[] = [
    mk({ method: "GET", path: "/pets", status: 200, executedAt: 5000 }),
    mk({ method: "POST", path: "/pets", status: 201, executedAt: 4000 }),
    mk({ method: "GET", path: "/users", status: 404, executedAt: 3000 }),
    mk({ method: "DELETE", path: "/users/1", status: 500, executedAt: 2000 }),
    mk({ method: "GET", path: "/health", status: 0, executedAt: 1000 }), // 네트워크 오류
  ];
  const filter = (over: Partial<HistoryFilter>) =>
    filterHistory(items, { ...EMPTY_HISTORY_FILTER, ...over });

  it("빈 필터는 전체 반환(순서 보존)", () => {
    expect(filter({})).toEqual(items);
  });
  it("텍스트는 path 부분일치", () => {
    expect(filter({ text: "users" }).map((i) => i.path)).toEqual(["/users", "/users/1"]);
  });
  it("텍스트는 대소문자 무시 + url 매칭", () => {
    expect(filter({ text: "API.TEST/USERS" }).map((i) => i.path)).toEqual(["/users", "/users/1"]);
  });
  it("메서드 다중 선택", () => {
    expect(filter({ methods: ["GET"] }).every((i) => i.method === "GET")).toBe(true);
    expect(filter({ methods: ["POST", "DELETE"] }).length).toBe(2);
  });
  it("상태 그룹 필터(4xx)", () => {
    expect(filter({ statusGroups: [4] }).map((i) => i.status)).toEqual([404]);
  });
  it("상태 그룹 다중(2xx,5xx)", () => {
    expect(filter({ statusGroups: [2, 5] }).map((i) => i.status)).toEqual([200, 201, 500]);
  });
  it("status 0(네트워크 오류)은 상태 필터 미선택 시에만 노출", () => {
    expect(filter({}).some((i) => i.status === 0)).toBe(true);
    expect(filter({ statusGroups: [2] }).some((i) => i.status === 0)).toBe(false);
  });
  it("시간 cutoff 이후만", () => {
    expect(filter({ since: 3000 }).map((i) => i.executedAt)).toEqual([5000, 4000, 3000]);
  });
  it("조건 AND 결합", () => {
    expect(filter({ methods: ["GET"], statusGroups: [2] }).map((i) => i.path)).toEqual(["/pets"]);
  });
  it("일치 없으면 빈 배열", () => {
    expect(filter({ text: "없는경로" })).toEqual([]);
  });
});
