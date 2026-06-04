// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import {
  eventToAccelerator,
  acceleratorToDisplay,
  loadShortcut,
  saveShortcut,
  registerShortcut,
  unregisterShortcut,
  DEFAULT_SHORTCUT,
} from "./global-shortcut";

function ke(over: Partial<KeyboardEvent>): KeyboardEvent {
  return { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, key: "", ...over } as KeyboardEvent;
}

describe("eventToAccelerator", () => {
  it("⌘⇧P → CmdOrCtrl+Shift+P", () => {
    expect(eventToAccelerator(ke({ metaKey: true, shiftKey: true, key: "p" }))).toBe("CmdOrCtrl+Shift+P");
  });
  it("Ctrl+Alt+F1 → CmdOrCtrl+Alt+F1", () => {
    expect(eventToAccelerator(ke({ ctrlKey: true, altKey: true, key: "F1" }))).toBe("CmdOrCtrl+Alt+F1");
  });
  it("modifier 없는 단일 키는 null (일반 타이핑 가로채기 방지)", () => {
    expect(eventToAccelerator(ke({ key: "p" }))).toBeNull();
  });
  it("modifier만 누르면(주 키 없음) null", () => {
    expect(eventToAccelerator(ke({ metaKey: true, key: "Meta" }))).toBeNull();
    expect(eventToAccelerator(ke({ shiftKey: true, key: "Shift" }))).toBeNull();
  });
});

describe("acceleratorToDisplay", () => {
  it("mac 표시로 변환한다", () => {
    expect(acceleratorToDisplay("CmdOrCtrl+Shift+P", "mac")).toBe("⌘⇧P");
    expect(acceleratorToDisplay("CmdOrCtrl+Alt+F1", "mac")).toBe("⌘⌥F1");
  });
  it("그 외 플랫폼은 Ctrl 표기", () => {
    expect(acceleratorToDisplay("CmdOrCtrl+Shift+P", "other")).toBe("Ctrl+Shift+P");
  });
  it("빈 문자열은 빈 표시", () => {
    expect(acceleratorToDisplay("", "mac")).toBe("");
  });
});

describe("loadShortcut / saveShortcut", () => {
  beforeEach(() => localStorage.clear());
  it("저장 후 복원한다", () => {
    saveShortcut("CmdOrCtrl+Alt+K");
    expect(loadShortcut()).toBe("CmdOrCtrl+Alt+K");
  });
  it("저장된 적 없으면 기본 단축키", () => {
    expect(loadShortcut()).toBe(DEFAULT_SHORTCUT);
  });
});

describe("registerShortcut / unregisterShortcut", () => {
  beforeEach(() => invokeMock.mockReset());

  it("accelerator가 있으면 register_global_shortcut 호출", async () => {
    invokeMock.mockResolvedValue(undefined);
    await registerShortcut("CmdOrCtrl+Shift+P");
    expect(invokeMock).toHaveBeenCalledWith("register_global_shortcut", {
      accelerator: "CmdOrCtrl+Shift+P",
    });
  });

  it("빈 문자열이면 unregister_global_shortcut 호출", async () => {
    invokeMock.mockResolvedValue(undefined);
    await registerShortcut("");
    expect(invokeMock).toHaveBeenCalledWith("unregister_global_shortcut");
  });

  it("unregisterShortcut는 unregister_global_shortcut 호출", async () => {
    invokeMock.mockResolvedValue(undefined);
    await unregisterShortcut();
    expect(invokeMock).toHaveBeenCalledWith("unregister_global_shortcut");
  });
});
