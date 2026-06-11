// 활성 Mock 설정 저장소 (IndexedDB).
// 캡처 프리셋을 적용한 활성 설정은 요청 엔트리에 실제 API 응답을 통째로 담아 수 MB가 될 수 있어
// localStorage(약 5MB) 용량을 초과한다 → mock-presets-store.ts와 같은 IndexedDB 패턴으로 저장한다.
// (읽기는 절대 throw 안 함, 쓰기는 성공 여부 반환)
import type { MockServerConfig } from "./mock-config";

const DB_NAME = "swaggerman-mock-config";
const STORE = "configs";

/** specUrl당 활성 설정을 한 레코드로 저장. */
interface ConfigRecord {
  specUrl: string;
  config: Partial<MockServerConfig>;
}

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

/** 저장된 원본 설정(부분일 수 있음) 또는 없으면 null. 오류 시에도 null. */
export async function loadStoredMockConfig(specUrl: string): Promise<Partial<MockServerConfig> | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(specUrl);
      req.onsuccess = () => {
        const v = req.result as ConfigRecord | undefined;
        resolve(v ? v.config : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** 설정 저장. 성공 여부 반환(실패 시 호출자가 사용자에게 알릴 수 있게). */
export async function saveStoredMockConfig(specUrl: string, config: MockServerConfig): Promise<boolean> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ specUrl, config } satisfies ConfigRecord);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/** 설정 삭제(프로젝트 제거 시 정리용). */
export async function deleteStoredMockConfig(specUrl: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(specUrl);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    /* 무시 */
  }
}
