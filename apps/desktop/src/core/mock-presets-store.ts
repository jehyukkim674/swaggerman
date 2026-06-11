// Mock 프리셋 저장소 (IndexedDB).
// 프록시/브라우저 캡처로 만든 프리셋은 실제 API 응답을 통째로 담아 수 MB가 될 수 있어
// localStorage(약 5MB) 용량을 초과한다 → 대용량을 담는 IndexedDB에 저장한다.
// spec-cache.ts의 IndexedDB 패턴을 따른다(읽기는 절대 throw 안 함, 쓰기는 성공 여부 반환).
import { loadJSON } from "./storage";
import type { MockOperationConfig, MockPreset, MockRequestEntry } from "./mock-config";

const DB_NAME = "swaggerman-mock-presets";
const STORE = "presets";

/** specUrl당 프리셋 배열을 한 레코드로 저장 (localStorage 모델과 동일). */
interface PresetRecord {
  specUrl: string;
  presets: MockPreset[];
}

/** 구버전 localStorage 프리셋 키 — 1회 마이그레이션용. */
const LEGACY_PREFIX = "swaggerman.mock.presets.";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "specUrl" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function readRecord(specUrl: string): Promise<MockPreset[] | null> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(specUrl);
    req.onsuccess = () => {
      const v = req.result as PresetRecord | undefined;
      resolve(v ? v.presets : null);
    };
    req.onerror = () => resolve(null);
  });
}

async function writeRecord(specUrl: string, presets: MockPreset[]): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ specUrl, presets } satisfies PresetRecord);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

/**
 * 스펙별 프리셋 목록(최신 우선). 없거나 오류면 빈 배열.
 * IndexedDB에 없고 구버전 localStorage에 있으면 1회 마이그레이션한다.
 */
export async function loadPresets(specUrl: string): Promise<MockPreset[]> {
  try {
    const fromDb = await readRecord(specUrl);
    if (fromDb && fromDb.length > 0) return fromDb;
    // 마이그레이션: 구버전 localStorage 프리셋
    const legacy = loadJSON<MockPreset[]>(`${LEGACY_PREFIX}${specUrl}`, []);
    if (legacy.length > 0) {
      await writeRecord(specUrl, legacy);
      try {
        localStorage.removeItem(`${LEGACY_PREFIX}${specUrl}`);
      } catch {
        /* 무시 */
      }
      return legacy;
    }
    return fromDb ?? [];
  } catch {
    return [];
  }
}

/**
 * 현재 operations를 제목 붙인 프리셋으로 저장(맨 앞에 추가). 성공 시 생성된 프리셋, 실패 시 null.
 * (localStorage와 달리 IndexedDB는 대용량을 담지만, 실패 가능성을 호출자가 알 수 있게 null 반환)
 */
export async function savePreset(
  specUrl: string,
  title: string,
  operations: MockOperationConfig[],
  requests?: MockRequestEntry[],
): Promise<MockPreset | null> {
  try {
    const preset: MockPreset = {
      id: crypto.randomUUID(),
      title,
      savedAt: Date.now(),
      operations: structuredClone(operations),
      requests: requests ? structuredClone(requests) : [],
    };
    const list = [preset, ...(await loadPresets(specUrl))];
    const ok = await writeRecord(specUrl, list);
    return ok ? preset : null;
  } catch {
    return null;
  }
}

/** 프리셋 삭제. */
export async function deletePreset(specUrl: string, id: string): Promise<void> {
  try {
    const list = (await loadPresets(specUrl)).filter((p) => p.id !== id);
    await writeRecord(specUrl, list);
  } catch {
    /* 무시 */
  }
}

/** 프리셋 제목 변경. */
export async function renamePreset(specUrl: string, id: string, title: string): Promise<void> {
  try {
    const list = (await loadPresets(specUrl)).map((p) => (p.id === id ? { ...p, title } : p));
    await writeRecord(specUrl, list);
  } catch {
    /* 무시 */
  }
}
