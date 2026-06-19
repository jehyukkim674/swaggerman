// 전체 백업/복원: 모든 swaggerman* localStorage 키 + IndexedDB 4개 스토어를
// 단일 JSON으로 덤프/복원한다. 버전 독립적 — 키를 통째로 보존/재기록한다.

/** 백업 대상 IndexedDB 스토어. 새 스토어가 생기면 여기에 추가한다. */
export const IDB_STORES: { db: string; store: string; keyPath: string }[] = [
  { db: "swaggerman-cache", store: "specs", keyPath: "url" },
  { db: "swaggerman-imports", store: "specs", keyPath: "url" },
  { db: "swaggerman-mock-config", store: "configs", keyPath: "specUrl" },
  { db: "swaggerman-mock-presets", store: "presets", keyPath: "specUrl" },
];

const LS_PREFIX = "swaggerman";

export interface BackupFile {
  swaggerman: "backup";
  schemaVersion: 1;
  exportedAt: number;
  appVersion?: string;
  localStorage: Record<string, string>;
  /** "dbName/storeName" → 레코드 배열 */
  indexedDB: Record<string, unknown[]>;
}

const idbKey = (db: string, store: string) => `${db}/${store}`;

/** swaggerman* 로 시작하는 모든 localStorage 키를 그대로 수집. */
export function collectLocalStorage(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LS_PREFIX)) {
      const val = localStorage.getItem(key);
      if (val != null) out[key] = val;
    }
  }
  return out;
}

/** 스토어가 없으면 생성하면서 DB를 연다(복원 시 새 설치본 대응). */
function openStore(db: string, store: string, keyPath: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(db, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(store)) d.createObjectStore(store, { keyPath });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAll(d: IDBDatabase, store: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    if (!d.objectStoreNames.contains(store)) return resolve([]);
    const tx = d.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

function clearStore(d: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function putAll(d: IDBDatabase, store: string, records: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    for (const rec of records) os.put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 4개 IDB 스토어의 전체 레코드를 수집. */
export async function collectIndexedDB(): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const { db, store, keyPath } of IDB_STORES) {
    const d = await openStore(db, store, keyPath);
    try {
      out[idbKey(db, store)] = await getAll(d, store);
    } finally {
      d.close();
    }
  }
  return out;
}

export async function buildBackup(appVersion?: string): Promise<BackupFile> {
  return {
    swaggerman: "backup",
    schemaVersion: 1,
    exportedAt: Date.now(),
    appVersion,
    localStorage: collectLocalStorage(),
    indexedDB: await collectIndexedDB(),
  };
}

export function serializeBackup(b: BackupFile): string {
  return JSON.stringify(b, null, 2);
}

/** 백업 파일 텍스트를 검증·파싱. 형식이 아니면 throw. */
export function parseBackup(text: string): BackupFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("백업 파일을 읽을 수 없습니다(JSON 형식 오류).");
  }
  const obj = json as Partial<BackupFile>;
  if (!obj || obj.swaggerman !== "backup" || typeof obj.localStorage !== "object") {
    throw new Error("SwaggerMan 백업 파일이 아닙니다.");
  }
  return {
    swaggerman: "backup",
    schemaVersion: 1,
    exportedAt: typeof obj.exportedAt === "number" ? obj.exportedAt : Date.now(),
    appVersion: obj.appVersion,
    localStorage: obj.localStorage as Record<string, string>,
    indexedDB: (obj.indexedDB as Record<string, unknown[]>) ?? {},
  };
}

/** 백업을 복원한다. replace면 기존 swaggerman 데이터를 먼저 비운다. */
export async function restoreBackup(b: BackupFile, mode: "merge" | "replace"): Promise<void> {
  // localStorage
  if (mode === "replace") {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LS_PREFIX)) toRemove.push(key);
    }
    for (const key of toRemove) localStorage.removeItem(key);
  }
  for (const [key, val] of Object.entries(b.localStorage)) {
    localStorage.setItem(key, val);
  }

  // IndexedDB
  for (const { db, store, keyPath } of IDB_STORES) {
    const records = b.indexedDB[idbKey(db, store)];
    if (!records) continue;
    const d = await openStore(db, store, keyPath);
    try {
      if (mode === "replace") await clearStore(d, store);
      await putAll(d, store, records);
    } finally {
      d.close();
    }
  }
}
