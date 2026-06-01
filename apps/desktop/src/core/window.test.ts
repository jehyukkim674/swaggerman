import { describe, it, expect, vi, beforeEach } from "vitest";

// Tauri WebviewWindow 모킹: 생성자 호출 인자를 검증한다.
const ctorSpy = vi.fn();
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: class {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(label: string, options: any) {
      ctorSpy(label, options);
    }
  },
}));

import { openNewWindow } from "./window";

describe("openNewWindow", () => {
  beforeEach(() => {
    ctorSpy.mockClear();
  });

  it("고유 label과 기본 창 옵션으로 새 창을 만든다", () => {
    openNewWindow();
    expect(ctorSpy).toHaveBeenCalledTimes(1);
    const [label, options] = ctorSpy.mock.calls[0];
    expect(label).toMatch(/^main-/);
    expect(options.url).toBe("index.html");
    expect(options.title).toBe("SwaggerMan");
    expect(options.width).toBeGreaterThan(0);
    expect(options.height).toBeGreaterThan(0);
  });

  it("연속 호출해도 label이 중복되지 않는다", () => {
    openNewWindow();
    openNewWindow();
    const labels = ctorSpy.mock.calls.map((c) => c[0]);
    expect(new Set(labels).size).toBe(2);
  });
});
