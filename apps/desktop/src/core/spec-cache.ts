// spec 로딩 성공 결과를 IndexedDB에 캐시한다. 이후 같은 URL 로딩이 실패하면
// App이 이 캐시를 꺼내 "오프라인 폴백"으로 직전 스펙을 보여준다.
// 모든 연산은 절대 throw하지 않는다(캐시는 부가 기능 — 본 로딩 흐름을 깨지 않음).
import type { ParsedSpec } from "./types";

const DB_NAME = "swaggerman-cache";
const STORE = "specs";

interface CachedSpec {
  url: string;
  savedAt: number;
  spec: ParsedSpec;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "url" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** spec 로딩 성공 결과를 URL 키로 저장(덮어쓰기). 실패는 조용히 무시. */
export async function saveSpecCache(url: string, spec: ParsedSpec): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ url, savedAt: Date.now(), spec } satisfies CachedSpec);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    /* 캐시 저장 실패(용량·지원 안 됨 등)는 무시 */
  }
}

/** URL에 캐시된 spec과 저장 시각을 반환. 없거나 오류면 null. */
export async function loadSpecCache(
  url: string,
): Promise<{ savedAt: number; spec: ParsedSpec } | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(url);
      req.onsuccess = () => {
        const v = req.result as CachedSpec | undefined;
        resolve(v ? { savedAt: v.savedAt, spec: v.spec } : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
