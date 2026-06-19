// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildBackup,
  serializeBackup,
  parseBackup,
  restoreBackup,
  collectLocalStorage,
  IDB_STORES,
} from "./backup";

// 특정 IDB 스토어에 레코드를 직접 넣는다.
function seedStore(db: string, store: string, keyPath: string, records: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(db, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(store)) d.createObjectStore(store, { keyPath });
    };
    req.onsuccess = () => {
      const d = req.result;
      const tx = d.transaction(store, "readwrite");
      for (const r of records) tx.objectStore(store).put(r);
      tx.oncomplete = () => {
        d.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function clearAllStores(): Promise<void[]> {
  return Promise.all(
    IDB_STORES.map(
      ({ db, store, keyPath }) =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.open(db, 1);
          req.onupgradeneeded = () => {
            const d = req.result;
            if (!d.objectStoreNames.contains(store)) d.createObjectStore(store, { keyPath });
          };
          req.onsuccess = () => {
            const d = req.result;
            const tx = d.transaction(store, "readwrite");
            tx.objectStore(store).clear();
            tx.oncomplete = () => {
              d.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
          req.onerror = () => reject(req.error);
        }),
    ),
  );
}

describe("collectLocalStorage", () => {
  beforeEach(() => localStorage.clear());
  it("swaggerman* 키만 수집하고 다른 키는 제외", () => {
    localStorage.setItem("swaggerman.theme", '"dark"');
    localStorage.setItem("swaggerman:file", "x");
    localStorage.setItem("other.thing", "no");
    const out = collectLocalStorage();
    expect(out["swaggerman.theme"]).toBe('"dark"');
    expect(out["swaggerman:file"]).toBe("x");
    expect(out["other.thing"]).toBeUndefined();
  });
});

describe("parseBackup", () => {
  it("정상 백업을 파싱", () => {
    const b = parseBackup(
      JSON.stringify({ swaggerman: "backup", schemaVersion: 1, localStorage: {}, indexedDB: {} }),
    );
    expect(b.swaggerman).toBe("backup");
  });
  it("백업 파일이 아니면 throw", () => {
    expect(() => parseBackup(JSON.stringify({ foo: 1 }))).toThrow(/백업 파일이 아닙니다/);
  });
  it("JSON 오류면 throw", () => {
    expect(() => parseBackup("{not json")).toThrow(/읽을 수 없습니다/);
  });
});

describe("백업 → 복원 왕복", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAllStores();
  });

  it("localStorage + IndexedDB를 백업하고 깨끗한 상태에서 복원한다", async () => {
    localStorage.setItem("swaggerman.theme", '"light"');
    localStorage.setItem("swaggerman.hist.https://x", '[{"id":"h1"}]');
    await seedStore("swaggerman-cache", "specs", "url", [{ url: "https://x", spec: { a: 1 } }]);
    await seedStore("swaggerman-mock-presets", "presets", "specUrl", [
      { specUrl: "https://x", presets: [{ id: "p1" }] },
    ]);

    const file = serializeBackup(await buildBackup("0.5.8"));

    // 전부 지우고 복원
    localStorage.clear();
    await clearAllStores();
    await restoreBackup(parseBackup(file), "replace");

    expect(localStorage.getItem("swaggerman.theme")).toBe('"light"');
    expect(localStorage.getItem("swaggerman.hist.https://x")).toBe('[{"id":"h1"}]');
    const back = await buildBackup();
    expect(back.indexedDB["swaggerman-cache/specs"]).toEqual([{ url: "https://x", spec: { a: 1 } }]);
    expect(back.indexedDB["swaggerman-mock-presets/presets"]).toEqual([
      { specUrl: "https://x", presets: [{ id: "p1" }] },
    ]);
  });

  it("replace 모드는 기존 swaggerman 키를 제거하고, 비-swaggerman 키는 보존", async () => {
    localStorage.setItem("swaggerman.old", "stale");
    localStorage.setItem("keepme", "yes");
    await restoreBackup(
      { swaggerman: "backup", schemaVersion: 1, exportedAt: 0, localStorage: { "swaggerman.new": "fresh" }, indexedDB: {} },
      "replace",
    );
    expect(localStorage.getItem("swaggerman.old")).toBeNull();
    expect(localStorage.getItem("swaggerman.new")).toBe("fresh");
    expect(localStorage.getItem("keepme")).toBe("yes");
  });

  it("merge 모드는 기존 swaggerman 키를 유지", async () => {
    localStorage.setItem("swaggerman.keep", "1");
    await restoreBackup(
      { swaggerman: "backup", schemaVersion: 1, exportedAt: 0, localStorage: { "swaggerman.add": "2" }, indexedDB: {} },
      "merge",
    );
    expect(localStorage.getItem("swaggerman.keep")).toBe("1");
    expect(localStorage.getItem("swaggerman.add")).toBe("2");
  });
});
