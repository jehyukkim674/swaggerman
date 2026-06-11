// 프로젝트(스펙) 삭제 시 스펙별 저장 데이터 정리.
// localStorage 키와 IndexedDB(Mock 설정·프리셋·스펙 캐시·가져온 파일)를 모두 지운다 —
// 키를 빠뜨리면 삭제한 프로젝트의 데이터가 남아 저장 용량을 잠식한다.
import { deleteImportedSpec, isFileProject } from "./imported-spec-store";
import { deleteStoredMockConfig } from "./mock-config-store";
import { deleteAllPresets } from "./mock-presets-store";
import { deleteSpecCache } from "./spec-cache";

/** 스펙별 localStorage 키 접두사 — 새 per-spec 키를 만들면 여기에도 추가한다. */
export const PER_SPEC_KEY_PREFIXES = [
  "swaggerman.fav.",
  "swaggerman.hist.",
  "swaggerman.auth.",
  "swaggerman.inputs.",
  "swaggerman.lastOp.",
  "swaggerman.baseURL.",
  "swaggerman.mock.",
  "swaggerman.mock.presets.", // 레거시(IndexedDB 이전 프리셋)
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
] as const;

/** 스펙 하나의 로컬 데이터를 전부 삭제한다. 실패해도 throw하지 않는다. */
export async function removeSpecLocalData(url: string): Promise<void> {
  for (const prefix of PER_SPEC_KEY_PREFIXES) {
    try {
      localStorage.removeItem(`${prefix}${url}`);
    } catch {
      /* 무시 */
    }
  }
  await Promise.all([
    deleteStoredMockConfig(url),
    deleteAllPresets(url),
    deleteSpecCache(url),
    isFileProject(url) ? deleteImportedSpec(url) : Promise.resolve(),
  ]);
}
