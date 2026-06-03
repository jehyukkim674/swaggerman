// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSnapshots, saveSnapshots, addSnapshot, groupByOp,
  loadTTConfig, saveTTConfig, defaultTTConfig, type Snapshot,
} from "./snapshots";

beforeEach(() => localStorage.clear());
const URL = "https://api.test/s.json";

function snap(opId: string, at: number, over: Partial<Snapshot> = {}): Snapshot {
  return { id: `${opId}-${at}`, opId, at, method: "GET", path: opId.split(" ")[1] ?? "/", status: 200, body: "{}", durationMs: 5, ...over };
}

describe("snapshots 저장/복원", () => {
  it("저장 후 복원", () => {
    saveSnapshots(URL, [snap("GET /a", 1)]);
    expect(loadSnapshots(URL)).toHaveLength(1);
  });
  it("없으면 빈 배열", () => {
    expect(loadSnapshots(URL)).toEqual([]);
  });
});

describe("addSnapshot", () => {
  it("추가하고 200개 cap(오래된 것 drop)", () => {
    let list: Snapshot[] = [];
    for (let i = 0; i < 230; i++) list = addSnapshot(list, snap("GET /a", i));
    expect(list.length).toBe(200);
    expect(list[0].at).toBe(30); // 앞 30개 drop
  });
});

describe("groupByOp", () => {
  it("opId별로 묶고 시간 오름차순 정렬", () => {
    const list = [snap("GET /a", 3), snap("GET /b", 1), snap("GET /a", 1)];
    const g = groupByOp(list);
    expect(g.get("GET /a")!.map((s) => s.at)).toEqual([1, 3]);
    expect(g.get("GET /b")!).toHaveLength(1);
  });
});

describe("TTConfig", () => {
  it("기본값: 빈 opIds, 5분, autoOff", () => {
    const c = defaultTTConfig();
    expect(c.opIds).toEqual([]);
    expect(c.intervalMin).toBe(5);
    expect(c.autoOn).toBe(false);
  });
  it("저장/복원", () => {
    saveTTConfig(URL, { opIds: ["GET /a"], intervalMin: 15, autoOn: true });
    expect(loadTTConfig(URL)).toEqual({ opIds: ["GET /a"], intervalMin: 15, autoOn: true });
  });
});
