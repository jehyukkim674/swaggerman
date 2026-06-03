// API 응답 스냅샷 저장·조회(시간여행). localStorage 영속(스펙별).
import { loadJSON, saveJSON } from "./storage";

export interface Snapshot {
  id: string;
  opId: string;
  at: number;
  method: string;
  path: string;
  status: number;
  body: string;
  durationMs: number;
}

export interface TimeTravelConfig {
  opIds: string[];
  intervalMin: number;
  autoOn: boolean;
}

const MAX_SNAPSHOTS = 200;

export function defaultTTConfig(): TimeTravelConfig {
  return { opIds: [], intervalMin: 5, autoOn: false };
}

export function loadSnapshots(specUrl: string): Snapshot[] {
  return loadJSON<Snapshot[]>(`swaggerman.snapshots.${specUrl}`, []);
}
export function saveSnapshots(specUrl: string, snaps: Snapshot[]): void {
  saveJSON(`swaggerman.snapshots.${specUrl}`, snaps);
}
export function loadTTConfig(specUrl: string): TimeTravelConfig {
  return loadJSON<TimeTravelConfig>(`swaggerman.ttconfig.${specUrl}`, defaultTTConfig());
}
export function saveTTConfig(specUrl: string, config: TimeTravelConfig): void {
  saveJSON(`swaggerman.ttconfig.${specUrl}`, config);
}

/** 스냅샷 추가(최근 MAX_SNAPSHOTS개 유지). 새 배열 반환. */
export function addSnapshot(list: Snapshot[], snap: Snapshot): Snapshot[] {
  const next = [...list, snap];
  return next.length > MAX_SNAPSHOTS ? next.slice(next.length - MAX_SNAPSHOTS) : next;
}

/** opId별로 묶고 각 그룹을 at 오름차순 정렬. */
export function groupByOp(list: Snapshot[]): Map<string, Snapshot[]> {
  const map = new Map<string, Snapshot[]>();
  for (const s of list) {
    if (!map.has(s.opId)) map.set(s.opId, []);
    map.get(s.opId)!.push(s);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.at - b.at);
  return map;
}
