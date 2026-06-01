import { describe, it, expect, vi, beforeEach } from "vitest";

// Tauri WebviewWindow 모킹: 생성자 호출 인자와 이벤트 리스너를 검증한다.
const ctorSpy = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onceHandlers: Record<string, (e: any) => void> = {};
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: class {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(label: string, options: any) {
      ctorSpy(label, options);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    once(event: string, handler: (e: any) => void) {
      onceHandlers[event] = handler;
    }
  },
}));

import { openNewWindow } from "./window";

describe("openNewWindow", () => {
  beforeEach(() => {
    ctorSpy.mockClear();
    delete onceHandlers["tauri://error"];
    delete onceHandlers["tauri://created"];
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

  it("창 생성 실패(tauri://error) 시 onError 콜백으로 에러 메시지를 전달한다", () => {
    const onError = vi.fn();
    openNewWindow(onError);
    // 에러 이벤트 리스너가 등록되어야 한다
    expect(onceHandlers["tauri://error"]).toBeTruthy();
    // Tauri가 에러 이벤트를 발생시키면
    onceHandlers["tauri://error"]({ payload: "not allowed by ACL" });
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("not allowed by ACL"));
  });

  it("성공(tauri://created) 시 onError가 호출되지 않는다", () => {
    const onError = vi.fn();
    openNewWindow(onError);
    expect(onceHandlers["tauri://created"]).toBeTruthy();
    onceHandlers["tauri://created"]({});
    expect(onError).not.toHaveBeenCalled();
  });
});
