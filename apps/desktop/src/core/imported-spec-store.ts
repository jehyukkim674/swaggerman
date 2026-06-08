// 파일에서 가져온(import) OpenAPI 스펙의 원본 텍스트를 IndexedDB에 보관한다.
// spec-cache(네트워크 캐시)와 분리된 전용 저장소 — 사용자 데이터라 캐시 정리 대상이 아니고,
// 저장 실패는 throw해서 import 실패를 호출처가 알 수 있게 한다.

export const FILE_PROJECT_PREFIX = "swaggerman:file:";
export const isFileProject = (url: string): boolean => url.startsWith(FILE_PROJECT_PREFIX);

const DB_NAME = "swaggerman-imports";
const STORE = "specs";

export interface ImportedSpecRecord {
  url: string; // 합성 키 swaggerman:file:<id>
  fileName: string; // 표시용 원본 파일명(basename)
  content: string; // 원본 스펙 텍스트(JSON/YAML 그대로)
  importedAt: number;
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

/** 스냅샷 저장(덮어쓰기). 실패 시 throw(= import 실패를 호출처에 전파). */
export async function saveImportedSpec(rec: ImportedSpecRecord): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** 합성 키로 스냅샷 조회. 없거나 오류면 null. */
export async function loadImportedSpec(url: string): Promise<ImportedSpecRecord | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(url);
      req.onsuccess = () => resolve((req.result as ImportedSpecRecord | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** 합성 키 스냅샷 삭제. 실패는 무시(no-op). */
export async function deleteImportedSpec(url: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    /* no-op */
  }
}
