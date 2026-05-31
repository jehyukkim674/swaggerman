// Vitest 전역 setup. jsdom 29 환경은 localStorage를 getItem/setItem/clear조차
// 없는 빈 객체로 노출하므로, Storage 호환 인메모리 폴리필을 주입한다.
// (node 환경 순수 테스트에는 영향 없음 — window/localStorage 부재 시 no-op.)

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

// jsdom이 활성화된 테스트에서 localStorage가 비정상(getItem 부재)이면 폴리필로 교체.
if (typeof globalThis.localStorage === "undefined" || typeof globalThis.localStorage.getItem !== "function") {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  if (typeof (globalThis as { window?: Window }).window !== "undefined") {
    Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
  }
}
